import { pruneBackups, takeBackup } from "./backup.ts";
import { resolveConfig } from "./config.ts";
import { openDb } from "./db.ts";

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
const { dbPath, backupDir } = config.value;

const now = Date.now();
const db = openDb(dbPath);
const result = takeBackup(db, backupDir, now);
db.close();
if (!result.ok) {
  console.error(`Backup of ${dbPath} failed: ${result.error}`);
  process.exit(1);
}
const pruned = pruneBackups(backupDir, now);
console.log(`Backup ${result.file}: integrity ok, ${result.docs} docs`);
if (pruned.length > 0) console.log(`Removed ${pruned.length} older backups: ${pruned.join(", ")}`);
