import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { exportAll, exportName } from "./export.ts";
import { createStore } from "./store.ts";

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
const { dbPath } = config.value;

const now = Date.now();
const db = openDb(dbPath);
const exported = exportAll(createStore(db), now);
db.close();
const dir = join(dirname(dbPath), "exports");
mkdirSync(dir, { recursive: true });
const file = join(dir, exportName(now));
writeFileSync(file, JSON.stringify(exported), { flag: "wx" });
console.log(`Exported ${exported.docs.length} docs to ${file}`);
