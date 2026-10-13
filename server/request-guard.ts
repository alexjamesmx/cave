/** Host names a fresh loopback server answers to; `ServerConfig.allowedHosts` adds more. */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const refuse = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Runs in front of every `/api/*` route and `/mcp`, before any token check.
 * - `Host` must be an allowed name, which stops DNS rebinding: a hostile page that re-points
 *   its own name at this machine still sends its own name as `Host`.
 * - A present `Origin` must be this server's own origin exactly (scheme, host and port), so
 *   another site, or another app on another localhost port, cannot use the owner's data.
 * - A `POST` must be JSON. Browsers send `text/plain` cross-site without a preflight; JSON
 *   needs one, which another origin cannot pass.
 */
export function guardRequest(req: Request, allowedHosts: string[]): Response | undefined {
  const host = req.headers.get("host");
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return refuse(403, "host not allowed");
  }
  if (!host || !allowedHosts.includes(hostname)) return refuse(403, "host not allowed");

  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) {
    return refuse(403, "origin not allowed");
  }

  if (req.method === "POST") {
    const type = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") return refuse(415, "content-type must be application/json");
  }
  return undefined;
}
