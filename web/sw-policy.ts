/**
 * Which requests the service worker serves network-first from its cache: same-origin GETs
 * outside the API. `/api/` and `/mcp` must always reach the server (sync, history, agents),
 * so a stale answer can never pass for a live one.
 */
export function isShellRequest(method: string, url: string, origin: string): boolean {
  if (method !== "GET") return false;
  const { origin: requestOrigin, pathname } = new URL(url);
  if (requestOrigin !== origin) return false;
  return !pathname.startsWith("/api/") && pathname !== "/mcp" && !pathname.startsWith("/mcp/");
}
