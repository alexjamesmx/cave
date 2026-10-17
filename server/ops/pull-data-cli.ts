import { resolve } from "node:path";
import { resolveConfig } from "../config.ts";
import { pullDataRefusal, restoreNewest } from "./pull-data.ts";
import { pullFromVps, reportPulled } from "./pull-remote.ts";

const ssh = process.env.CAVE_SSH || "cave-vps";
const remoteDir = process.env.CAVE_REMOTE_BACKUP_DIR || "/var/lib/cave/backups";
const dir = process.env.BACKUP_PULL_DIR;
if (!dir) {
  console.error("Set BACKUP_PULL_DIR (in the laptop's .env) to the folder that receives backups");
  process.exit(1);
}
const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
const { dbPath, env } = config.value;
const repoRoot = resolve(import.meta.dir, "../..");

// Refuse before copying anything, so a running dev server isn't left waiting on a pull.
const refusal = pullDataRefusal(dbPath, env, repoRoot);
if (refusal) {
  console.error(`Not pulled: ${refusal}`);
  process.exit(1);
}
const pulled = pullFromVps(ssh, remoteDir, dir);
if (!pulled.ok) {
  console.error(pulled.error);
  process.exit(1);
}
reportPulled(pulled.results, dir, ssh);

const result = restoreNewest({ dir, dbPath, env, repoRoot, now: Date.now() });
if (!result.ok) {
  console.error(`Not restored: ${result.error}`);
  process.exit(1);
}
console.log(
  `Restored ${result.backup} (taken ${new Date(result.at).toISOString()}) into ${dbPath}: ${result.docs} docs`,
);
if (result.prev) console.log(`Previous database kept as ${result.prev}`);
if (pulled.results.some((r) => !r.ok)) process.exit(1);
