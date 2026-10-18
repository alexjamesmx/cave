/**
 * The e2e suite's stand-in for Caddy: it forwards every request to the Cave server and adds
 * the Content-Security-Policy that `deploy/Caddyfile` sends in production, read from that
 * file, so the browser checks run under the same policy.
 */
const caddy = await Bun.file(new URL("../deploy/Caddyfile", import.meta.url)).text();
const policy = /Content-Security-Policy "([^"]+)"/.exec(caddy)?.[1];
if (!policy) throw new Error("deploy/Caddyfile has no Content-Security-Policy");

const port = Number(process.env.PORT);
const target = process.env.CAVE_E2E_TARGET as string;

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const upstream = await fetch(new URL(url.pathname + url.search, target), {
      method: req.method,
      // The original Host and Origin go through, as Caddy keeps them.
      headers: req.headers,
      ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: await req.arrayBuffer() }),
      redirect: "manual",
    });
    const headers = new Headers(upstream.headers);
    // fetch has already decoded the body.
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.set("Content-Security-Policy", policy);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
});
