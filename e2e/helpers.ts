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
