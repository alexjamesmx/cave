/** Host names a fresh loopback server answers to; `ServerConfig.allowedHosts` adds more. */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const refuse = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Runs in front of every `/api/*` route and `/mcp`, before any token check.
 * - `Host` must be an allowed name, which stops DNS rebinding: a hostile page that re-points
 *   its own name at this machine still sends its own name as `Host`.
 * - A present `Origin` must be this server's own origin exactly (scheme, host and port), so
 *   another site, or another app on another localhost port, cannot use the owner's data.
 *   Behind a reverse proxy `req.url` says `http:` while browsers send the public `https:`
 *   origin, so requests for the public host must match `publicOrigin` instead. Forwarded
 *   headers are never read: anyone can send them.
 * - A `POST` must be JSON. Browsers send `text/plain` cross-site without a preflight; JSON
 *   needs one, which another origin cannot pass.
 */
export function guardRequest(
  req: Request,
  allowedHosts: string[],
  publicOrigin?: string,
): Response | undefined {
  const host = req.headers.get("host");
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return refuse(403, "host not allowed");
  }
  if (!host || !allowedHosts.includes(hostname)) return refuse(403, "host not allowed");

  const origin = req.headers.get("origin");
  const expected =
    publicOrigin !== undefined && hostname === new URL(publicOrigin).hostname
      ? publicOrigin
      : new URL(req.url).origin;
  if (origin !== null && origin !== expected) {
    return refuse(403, "origin not allowed");
  }

  if (req.method === "POST") {
    const type = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") return refuse(415, "content-type must be application/json");
  }
  return undefined;
}
