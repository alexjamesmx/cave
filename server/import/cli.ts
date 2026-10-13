import { seedDocs } from "../../shared/seed.ts";
import { resolveConfig } from "../config.ts";
import { openDb } from "../db.ts";
import { createStore } from "../store.ts";
import { formatReport, importVault } from "./importer.ts";

const config = resolveConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
const { dbPath, vaultPath } = config.value;
if (!vaultPath) {
  console.error("Set VAULT_PATH to the Obsidian vault to import from");
  process.exit(1);
}

const store = createStore(openDb(dbPath));
store.seedIfEmpty(seedDocs(), Date.now());
const report = await importVault({ root: vaultPath, store, now: Date.now() });
console.log(`Imported ${vaultPath} into ${dbPath}\n${formatReport(report)}`);
if (report.ledgerDocs !== report.ledgerFiles) process.exit(1);
