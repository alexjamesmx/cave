import { seedDocs } from "../shared/seed.ts";
import { openDb } from "./db.ts";
import { createStore } from "./store.ts";
import { createSyncHandler, MAX_BODY_BYTES } from "./sync.ts";

const store = createStore(openDb(process.env.CAVE_DB_PATH || "data/cave.db"));
store.seedIfEmpty(seedDocs(), Date.now());

const sync = createSyncHandler({
  store,
  token: process.env.JARVIS_TOKEN || undefined,
  now: Date.now,
});

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  maxRequestBodySize: MAX_BODY_BYTES,
  routes: {
    "/api/sync": { POST: sync },
  },
  fetch: () => Response.json({ error: "not found" }, { status: 404 }),
});

console.log(`Cave server listening on ${server.url}`);
