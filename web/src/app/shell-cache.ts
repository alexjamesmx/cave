import { isShellRequest } from "../../sw-policy.ts";

export const SHELL_CACHE = "cave-shell";

/**
 * Cached URLs this page did not load: assets of an older release (each release brings new
 * hashed names, the stylesheet alone is 488 KB) and routes visited before. `/` always
 * stays; it is the offline fallback for every route.
 */
export function staleShellEntries(cached: string[], loaded: string[], origin: string): string[] {
  const keep = new Set([...loaded, new URL("/", origin).href]);
  return cached.filter((url) => !keep.has(url));
}

/**
 * The first visit loads the app before the service worker controls the page, so none of it
 * passes through the worker's cache. Once the worker is ready, the page stores what it has
 * already loaded (the same filter the worker uses), so one online visit is enough to open
 * the app offline, and drops what it no longer uses, so the cache does not grow per release.
 */
export async function warmShellCache(): Promise<void> {
  const urls = new Set([new URL("/", location.origin).href, location.href]);
  for (const entry of performance.getEntriesByType("resource")) urls.add(entry.name);
  const shell = [...urls].filter((url) => isShellRequest("GET", url, location.origin));
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(shell.map((url) => cache.add(url).catch(() => undefined)));
  const cached = (await cache.keys()).map((request) => request.url);
  await Promise.all(
    staleShellEntries(cached, shell, location.origin).map((url) => cache.delete(url)),
  );
}
