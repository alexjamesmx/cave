import { Database } from "bun:sqlite";
import { pruneBackups, takeBackup } from "./backup.ts";
import { resolveConfig } from "./config.ts";

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
const { dbPath, backupDir } = config.value;

const now = Date.now();
// Read-only and without migrations: taking a backup never changes the database it copies.
const db = new Database(dbPath, { readonly: true });
const result = takeBackup(db, backupDir, now);
db.close();
if (!result.ok) {
  console.error(`Backup of ${dbPath} failed: ${result.error}`);
  process.exit(1);
}
const pruned = pruneBackups(backupDir, now);
console.log(`Backup ${result.file}: integrity ok, ${result.docs} docs`);
if (pruned.length > 0) console.log(`Removed ${pruned.length} older backups: ${pruned.join(", ")}`);
