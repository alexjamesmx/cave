import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "@playwright/test";
import { expect, violations } from "./test.ts";

/** The e2e server's token, set by `playwright.config.ts`. */
export const E2E_TOKEN = process.env.CAVE_E2E_TOKEN as string;

/** A browser context already unlocked, as a device the owner set up once. */
export async function ownerContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({ timezoneId: SEED_ZONE, ...options });
  // The browser reports a CSP violation on the console; the guard in test.ts fails the spec.
  context.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text()))
      violations.push(message.text());
  });
  await context.addInitScript((token) => {
    if (!localStorage.getItem("cave.token")) localStorage.setItem("cave.token", token);
  }, E2E_TOKEN);
  return context;
}

export const syncBadge = (page: Page) =>
  page.getByRole("status").filter({ hasText: /SYNC|OFFLINE/ });

/**
 * Records every request the context makes to a host other than the app's own; a test ends
 * by expecting the list to be empty (fonts and everything else ship with the app).
 */
export function offOriginRequests(context: BrowserContext, baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  const seen: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    // Only network requests count; data:, blob: and the browser's own pages (edge://) don't.
    if (!/^(https?|wss?):$/.test(url.protocol)) return;
    if (url.origin !== origin) seen.push(request.url());
  });
  return seen;
}

/** Ask → Expense (or Income): the money form, saved. `category` is its shown name. */
export async function addMoney(
  page: Page,
  entry: {
    amount: number;
    title: string;
    category?: string;
    income?: boolean;
    yesterday?: boolean;
  },
) {
  const sheet = await openNew(page);
  await sheet.getByRole("button", { name: "Money", exact: true }).click();
  const form = sheet.getByRole("form", { name: /Expense|Income/ });
  if (entry.income) await form.getByRole("button", { name: "Income", exact: true }).click();
  await form.getByLabel("Amount").fill(String(entry.amount));
  await form.getByLabel("Title").fill(entry.title);
  if (entry.category) {
    await form.getByRole("combobox", { name: "Category", exact: true }).fill(entry.category);
    await page.getByRole("option", { name: new RegExp(`${entry.category}$`) }).click();
  }
  if (entry.yesterday) await form.getByRole("button", { name: "Yesterday" }).click();
  await form.getByRole("button", { name: "Save" }).click();
}

/** Opens the New sheet (the rail's or the dock's New), unless it is already open. */
export async function openNew(page: Page) {
  const sheet = page.getByRole("dialog", { name: "New" });
  if ((await sheet.count()) === 0)
    await page.getByRole("button", { name: "New", exact: true }).first().click();
  return sheet;
}

/** The e2e database's timezone (seeded), for a reminder's wall-clock date and time. */
export const SEED_ZONE = "America/Mexico_City";

/** A wall-clock date and time `minutes` from `now` in the seeded timezone. */
export function wallIn(minutes: number, now = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SEED_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(now.getTime() + minutes * 60_000))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** New → Reminder: title, date, time and repeat as given, then Save. */
export async function addReminder(
  page: Page,
  r: { title: string; date?: string; time?: string; repeat?: string },
) {
  const sheet = await openNew(page);
  await sheet.getByRole("button", { name: "Reminder", exact: true }).click();
  const form = sheet.getByRole("form", { name: "Reminder" });
  await form.getByLabel("Title").fill(r.title);
  if (r.date) await form.getByLabel("Date").fill(r.date);
  if (r.time !== undefined) await form.getByLabel("Time").fill(r.time);
  if (r.repeat) await form.getByLabel("Repeat").selectOption({ label: r.repeat });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Saved · Reminder · ${r.title}` }),
  ).toBeVisible();
}

/**
 * Runs `action` (a Delete) and waits until the delete has reached the server, so the next
 * spec, on another device, never sees an item this one cleaned up.
 */
export async function pushed(page: Page, action: () => Promise<unknown>): Promise<void> {
  const sent = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/sync") &&
      r.request().method() === "POST" &&
      (r.request().postData() ?? "").includes('"_deleted":true'),
  );
  await action();
  await sent;
}

/** A write-scope agent on the e2e server's database, as `bun run agent add` makes one. */
function mintAgent(name: string): string {
  const out = spawnSync(
    "bun",
    ["run", "server/cli/agent.ts", "add", name, "--scopes", "read,write"],
    {
      env: {
        ...process.env,
        CAVE_DB_PATH: join(process.env.CAVE_E2E_DIR as string, "cave.db"),
        CAVE_TOKEN: "",
        CAVE_HOST: "",
      },
      encoding: "utf8",
    },
  );
  const token = out.stdout.trim().split("\n").at(-1) ?? "";
  if (!token.startsWith("cave_")) throw new Error(`no agent token: ${out.stderr}`);
  return token;
}

/** An MCP client for a fresh write-scope agent, connected to the e2e server. */
export async function mcpClient(baseURL: string, name: string) {
  const client = new Client(
    { name: "cave-e2e", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", baseURL), {
      requestInit: { headers: { authorization: `Bearer ${mintAgent(`${name}-${Date.now()}`)}` } },
    }),
  );
  return client;
}
