import { Database } from "bun:sqlite";
import {
  BACKUP_PATTERN,
  backupName,
  PRE_DEPLOY_PATTERN,
  preDeployName,
  pruneBackups,
  pruneBeyondNewest,
  takeBackup,
  verifyBackup,
} from "./backup.ts";
import { BACKUP_USAGE, parseBackupArgs } from "./backup-args.ts";
import { resolveConfig } from "./config.ts";

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
const args = parseBackupArgs(process.argv.slice(2));
if (!args.ok) {
  console.error(`${args.error}\n${BACKUP_USAGE}`);
  process.exit(1);
}
const { dbPath } = config.value;
const { dir = config.value.backupDir, keep, sha } = args.value;

const now = Date.now();
// Read-only and without migrations: taking a backup never changes the database it copies.
const db = new Database(dbPath, { readonly: true });
const name = sha ? preDeployName(now, sha) : backupName(now);
const result = takeBackup(db, dir, now, verifyBackup, name);
db.close();
if (!result.ok) {
  console.error(`Backup of ${dbPath} failed: ${result.error}`);
  process.exit(1);
}
const pattern = sha ? PRE_DEPLOY_PATTERN : BACKUP_PATTERN;
const pruned = keep ? pruneBeyondNewest(dir, pattern, keep) : pruneBackups(dir, now);
// cave-deploy reads the file name from this line; keep its shape.
console.log(`Backup ${result.file}: integrity ok, ${result.docs} docs`);
if (pruned.length > 0) console.log(`Removed ${pruned.length} older backups: ${pruned.join(", ")}`);
