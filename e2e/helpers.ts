import type { BrowserContext, Page } from "@playwright/test";

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
