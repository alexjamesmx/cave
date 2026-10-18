import { seedDocs } from "../../shared/seed.ts";
import { resolveConfig } from "../config.ts";
import { openDb } from "../db.ts";
import { migrateSeed } from "../seed-migrations.ts";
import { createStore } from "../store.ts";
import { formatReport, importVault } from "./importer.ts";
import { importRemote } from "./remote.ts";

const remote = process.argv.includes("--remote");
const dryRun = process.argv.includes("--dry-run");

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

if (remote) {
  const url = process.env.CAVE_REMOTE_URL;
  const token = process.env.CAVE_REMOTE_TOKEN;
  if (!url || !token) {
    console.error(
      "Set CAVE_REMOTE_URL and CAVE_REMOTE_TOKEN (in the laptop's .env) to import into the hosted server",
    );
    process.exit(1);
  }
  const { report, pushed, refused } = await importRemote(vaultPath, { url, token }, dryRun);
  console.log(
    `${dryRun ? "Dry run: would import" : "Imported"} ${vaultPath} into ${new URL(url).host}\n${formatReport(report)}`,
  );
  if (!dryRun) console.log(`Pushed ${pushed}, refused ${refused}`);
  if (report.ledgerDocs !== report.ledgerFiles || refused > 0) process.exit(1);
} else {
  const store = createStore(openDb(dbPath));
  store.seedIfEmpty(seedDocs(), Date.now());
  migrateSeed(store, Date.now());
  const report = await importVault({ root: vaultPath, store, now: Date.now(), dryRun });
  console.log(
    `${dryRun ? "Dry run: would import" : "Imported"} ${vaultPath} into ${dbPath}\n${formatReport(report)}`,
  );
  if (report.ledgerDocs !== report.ledgerFiles) process.exit(1);
}
