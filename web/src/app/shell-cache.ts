import { isShellRequest } from "../../sw-policy.ts";

export const SHELL_CACHE = "cave-shell";

/**
 * The first visit loads the app before the service worker controls the page, so none of it
 * passes through the worker's cache. Once the worker is ready, the page stores what it has
 * already loaded (the same filter the worker uses), so one online visit is enough to open
 * the app offline.
 */
export async function warmShellCache(): Promise<void> {
  const urls = new Set([new URL("/", location.origin).href, location.href]);
  for (const entry of performance.getEntriesByType("resource")) urls.add(entry.name);
  const shell = [...urls].filter((url) => isShellRequest("GET", url, location.origin));
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(shell.map((url) => cache.add(url).catch(() => undefined)));
}
