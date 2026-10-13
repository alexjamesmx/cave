import { join } from "node:path";

/**
 * Bundles the service worker once at start-up and keeps it in memory. It is served at the
 * root so its scope covers the whole app; `no-cache` makes browsers check for an update
 * on every load.
 */
export async function buildServiceWorker(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "..", "web", "sw.ts")],
    target: "browser",
    minify: true,
  });
  const output = result.outputs[0];
  if (!result.success || !output) {
    throw new AggregateError(result.logs, "service worker build failed");
  }
  return new Response(await output.text(), {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}
