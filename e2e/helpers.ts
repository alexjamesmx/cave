import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "@playwright/test";
import { violations } from "./test.ts";

/** The e2e server's token, set by `playwright.config.ts`. */
export const E2E_TOKEN = process.env.CAVE_E2E_TOKEN as string;

/** A browser context already unlocked, as a device the owner set up once. */
export async function ownerContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
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

/** Home → Expense (or Income): the money form, saved. `category` is its shown name. */
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
  if (new URL(page.url()).pathname !== "/") await page.goto("/");
  await page.getByRole("button", { name: "Expense" }).first().click();
  const form = page.getByRole("form", { name: /Expense|Income/ });
  if (entry.income) await form.getByRole("button", { name: "Income", exact: true }).click();
  await form.getByLabel("Amount").fill(String(entry.amount));
  await form.getByLabel("Title").fill(entry.title);
  if (entry.category)
    await form.getByRole("button", { name: new RegExp(`${entry.category}$`) }).click();
  if (entry.yesterday) await form.getByRole("button", { name: "Yesterday" }).click();
  await form.getByRole("button", { name: "Save" }).click();
}

/** Home → Reminder: title and plain-language "When"; returns the form for its preview. */
export async function fillReminder(page: Page, title: string, when: string) {
  if (new URL(page.url()).pathname !== "/") await page.goto("/");
  const form = page.getByRole("form", { name: "Reminder" });
  if ((await form.count()) === 0) await page.getByRole("button", { name: "Reminder" }).click();
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("When").fill(when);
  return form;
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
export function mintAgent(name: string): string {
  const out = spawnSync(
    "bun",
    ["run", "server/agent-cli.ts", "add", name, "--scopes", "read,write"],
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
