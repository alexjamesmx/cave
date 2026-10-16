import type { Browser, BrowserContext, BrowserContextOptions, Page } from "@playwright/test";

/** The e2e server's token, set by `playwright.config.ts`. */
export const E2E_TOKEN = process.env.CAVE_E2E_TOKEN as string;

/** A browser context already unlocked, as a device the owner set up once. */
export async function ownerContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
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
