import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedDocs } from "../shared/seed.ts";
import web from "../web/index.html";
import { createCallLog } from "./agent-calls.ts";
import { createAgentRegistry } from "./agents.ts";
import { serveCave } from "./app.ts";
import { resolveConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { formatReport, importIfEmpty, importVault, newNotes } from "./import/importer.ts";
import { createBackupJob } from "./jobs/backup-job.ts";
import { createScheduler } from "./jobs/scheduler.ts";
import { acquireLock, lockPathOf, releaseLock } from "./lock.ts";
import { createNotificationSystem } from "./notify/system.ts";
import { migrateSeed } from "./seed-migrations.ts";
import { createStore } from "./store.ts";
import { buildServiceWorker } from "./sw.ts";

const production = process.argv.includes("--production");
const config = resolveConfig(process.env, { production });
if (!config.ok) {
  console.error(`Cave server not started: ${config.error}`);
  process.exit(1);
}
const {
  hostname,
  port,
  token,
  dbPath,
  vaultPath,
  allowedHosts,
  publicOrigin,
  backupDir,
  deployStatusPath,
  push,
  telegramToken,
  discordWebhook,
} = config.value;

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

// Links in messages point at the address the owner opens: the public origin behind Caddy.
const origin =
  publicOrigin ?? `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:${port}`;
const notifications = createNotificationSystem({
  db,
  store,
  now: Date.now,
  origin,
  push,
  telegramToken,
  discordWebhook,
  production,
});
if (!push) console.log("Web Push is off: no VAPID keys (bun run push-keys)");

const { version } = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
  version: string;
};
// The deploy script checks out one commit; status reports it so a deploy can confirm it.
const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: import.meta.dir });
const commit = git.success ? git.stdout.toString().trim() : null;
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
  ...(publicOrigin ? { publicOrigin } : {}),
  status: {
    version,
    commit,
    backupDir,
    newVaultNotes: () => newVaultNotes,
    ...(deployStatusPath ? { deployStatusPath } : {}),
  },
  notifications: notifications.routes,
  development: !production,
});
console.log(`Cave server listening on ${server.url}${production ? "" : " (development)"}`);

// One loop for every server job; the backup check moved here from its own timer.
createScheduler({
  jobs: [...notifications.jobs, createBackupJob(db, backupDir)],
  db,
  now: Date.now,
}).start();
