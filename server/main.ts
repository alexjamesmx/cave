import { seedDocs } from "../shared/seed.ts";
import { resolveConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { formatReport, importIfEmpty } from "./import/importer.ts";
import { createStore } from "./store.ts";
import { createSyncHandler, MAX_BODY_BYTES } from "./sync.ts";

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(`Cave server not started: ${config.error}`);
  process.exit(1);
}
const { hostname, port, token, dbPath, vaultPath } = config.value;

const store = createStore(openDb(dbPath));
store.seedIfEmpty(seedDocs(), Date.now());
const imported = await importIfEmpty(store, vaultPath, Date.now());
if (imported)
  console.log(`Imported ${vaultPath}
${formatReport(imported)}`);

const sync = createSyncHandler({ store, token, now: Date.now });

const server = Bun.serve({
  hostname,
  port,
  maxRequestBodySize: MAX_BODY_BYTES,
  routes: {
    "/api/sync": { POST: sync },
  },
  fetch: () => Response.json({ error: "not found" }, { status: 404 }),
});

console.log(`Cave server listening on ${server.url}`);
