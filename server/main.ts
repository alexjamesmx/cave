import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedDocs } from "../shared/seed.ts";
import web from "../web/index.html";
import { createCallLog } from "./agent-calls.ts";
import { createAgentRegistry } from "./agents.ts";
import { serveCave } from "./app.ts";
import { backupIfDue } from "./backup.ts";
import { resolveConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { formatReport, importIfEmpty, importVault, newNotes } from "./import/importer.ts";
import { acquireLock, lockPathOf, releaseLock } from "./lock.ts";
import { migrateSeed } from "./seed-migrations.ts";
import { createStore } from "./store.ts";
import { buildServiceWorker } from "./sw.ts";

const BACKUP_CHECK_MS = 60 * 60 * 1000;

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(`Cave server not started: ${config.error}`);
  process.exit(1);
}
const { hostname, port, token, dbPath, vaultPath, allowedHosts, backupDir } = config.value;
const production = process.argv.includes("--production");

if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
const lock = lockPathOf(dbPath);
const acquired = acquireLock(lock);
if (!acquired.ok) {
  console.error(
    `Cave server not started: another one (pid ${acquired.pid}) uses ${dbPath}. If none is running, delete ${lock}`,
  );
  process.exit(1);
}
if (acquired.replaced !== undefined) {
  console.log(`Replaced a stale lock left by pid ${acquired.replaced}`);
}
process.on("exit", () => releaseLock(lock));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => process.exit(0));

const db = openDb(dbPath);
const store = createStore(db);
store.seedIfEmpty(seedDocs(), Date.now());
migrateSeed(store, Date.now());
const imported = await importIfEmpty(store, vaultPath, Date.now());
if (imported) console.log(`Imported ${vaultPath}\n${formatReport(imported)}`);

// Importing on every start would bring a renamed vault note back as a duplicate, so the
// owner is only told; `bun run import` adds them.
let newVaultNotes: number | null = null;
if (vaultPath) {
  newVaultNotes = imported
    ? 0
    : newNotes(await importVault({ root: vaultPath, store, now: Date.now(), dryRun: true }));
  if (newVaultNotes > 0) console.log(`Vault has ${newVaultNotes} new notes: run bun run import`);
}

const backUp = () => {
  try {
    const result = backupIfDue(db, backupDir, Date.now());
    if (result?.ok) console.log(`Backup ${result.file}: integrity ok, ${result.docs} docs`);
    else if (result) console.error(`Backup failed: ${result.error}`);
  } catch (error) {
    console.error(`Backup failed: ${(error as Error).message}`);
  }
};
backUp();
setInterval(backUp, BACKUP_CHECK_MS);

const { version } = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
  version: string;
};
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
  },
  allowedHosts,
  status: { version, backupDir, newVaultNotes: () => newVaultNotes },
  development: !production,
});
console.log(`Cave server listening on ${server.url}${production ? "" : " (development)"}`);
