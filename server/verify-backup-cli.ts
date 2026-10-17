import { basename } from "node:path";
import { verifyBackup } from "./backup.ts";

// The same check and line a backup gets when it is taken, for a copy restored from anywhere;
// `deploy/cave-offsite` reads the doc count from it.
const file = process.argv[2];
if (!file) {
  console.error("Usage: bun run verify-backup <backup file>");
  process.exit(1);
}
const result = verifyBackup(file);
if (!result.ok) {
  console.error(`${basename(file)}: ${result.error}`);
  process.exit(1);
}
console.log(`${basename(file)}: integrity ok, ${result.docs} docs`);
