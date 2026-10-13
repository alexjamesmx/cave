import { seedDocs } from "../shared/seed.ts";
import web from "../web/index.html";
import { createCallLog } from "./agent-calls.ts";
import { createAgentRegistry } from "./agents.ts";
import { serveCave } from "./app.ts";
import { resolveConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { formatReport, importIfEmpty } from "./import/importer.ts";
import { migrateSeed } from "./seed-migrations.ts";
import { createStore } from "./store.ts";
import { buildServiceWorker } from "./sw.ts";

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(`Cave server not started: ${config.error}`);
  process.exit(1);
}
const { hostname, port, token, dbPath, vaultPath, allowedHosts } = config.value;

const db = openDb(dbPath);
const store = createStore(db);
store.seedIfEmpty(seedDocs(), Date.now());
migrateSeed(store, Date.now());
const imported = await importIfEmpty(store, vaultPath, Date.now());
if (imported) console.log(`Imported ${vaultPath}\n${formatReport(imported)}`);

const serviceWorker = await buildServiceWorker();
const server = serveCave({
  hostname,
  port,
  store,
  token,
  now: Date.now,
  web,
  serviceWorker,
  agents: {
    registry: createAgentRegistry(db),
    calls: createCallLog(db),
    vaultPath,
    allowedHosts,
  },
});
console.log(`Cave server listening on ${server.url}`);
