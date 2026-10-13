import { resolveConfig } from "./config.ts";
import { restoreBackup } from "./restore.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: bun run restore <backup file>");
  process.exit(1);
}
const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
const { dbPath } = config.value;

const result = restoreBackup(file, dbPath, Date.now());
if (!result.ok) {
  console.error(`Not restored: ${result.error}`);
  process.exit(1);
}
if (result.staleLock !== undefined) {
  console.log(`Replaced a stale lock left by pid ${result.staleLock}`);
}
console.log(`Restored ${file} into ${dbPath}: ${result.docs} docs, new database id ${result.dbId}`);
for (const kept of result.kept) console.log(`Previous file kept as ${kept}`);
console.log("Devices push back anything newer than the backup on their next sync.");
