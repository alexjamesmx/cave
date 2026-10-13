import type { HTMLBundle } from "bun";
import type { Store } from "./store.ts";
import { createSyncHandler, MAX_BODY_BYTES } from "./sync.ts";

export interface AppOptions {
  hostname: string;
  port: number;
  store: Store;
  token: string | undefined;
  now: () => number;
  /** The PWA; every non-API path serves it so client routes survive a reload. */
  web?: HTMLBundle;
}

/** The HTTP server; `main.ts` and tests that need a real socket both start it from here. */
export function serveCave({ hostname, port, store, token, now, web }: AppOptions) {
  const notFound = Response.json({ error: "not found" }, { status: 404 });
  return Bun.serve({
    hostname,
    port,
    maxRequestBodySize: MAX_BODY_BYTES,
    routes: {
      "/api/sync": { POST: createSyncHandler({ store, token, now }) },
      "/api/*": notFound,
      "/*": web ?? notFound,
    },
    fetch: () => Response.json({ error: "not found" }, { status: 404 }),
  });
}
