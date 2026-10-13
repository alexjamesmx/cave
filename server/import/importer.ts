import { createHash } from "node:crypto";
import { fieldsOf, validateFields } from "../../shared/fields.ts";
import { formatStamp } from "../../shared/hlc.ts";
import type { Field } from "../../shared/schema.ts";
import type { Doc } from "../../shared/types.ts";
import type { Store } from "../store.ts";
import { isDataKey } from "../validate.ts";
import { parseNote } from "./frontmatter.ts";
import { mapNote } from "./mappers.ts";
import { collectionOf, listNotes, readCategoryNames, readVaultFile } from "./sources.ts";

export const IMPORT_ACTOR = "import";

export interface ImportReport {
  /** Docs added per collection by this run. */
  added: Record<string, number>;
  /** Notes whose id was already in the database. */
  skipped: number;
  ledgerFiles: number;
  /** Ledger notes that became docs, added or already there; must equal `ledgerFiles`. */
  ledgerDocs: number;
  /** Frontmatter keys kept in `data` that are not fields, per collection. */
  extraKeys: Record<string, string[]>;
  categoriesAdded: string[];
  problems: string[];
}

export const importId = (path: string) => `imp-${createHash("sha1").update(path).digest("hex")}`;

interface Options {
  root: string;
  store: Store;
  now: number;
}

/** Add-only import from the vault into `store`. Reads the vault, never writes to it. */
export async function importVault({ root, store, now }: Options): Promise<ImportReport> {
  const stamp = formatStamp(now, 0, IMPORT_ACTOR);
  const timeZone = store.get("settings")?.data.timezone;
  if (typeof timeZone !== "string") throw new Error("settings doc has no timezone; seed first");

  const report: ImportReport = {
    added: {},
    skipped: 0,
    ledgerFiles: 0,
    ledgerDocs: 0,
    extraKeys: {},
    categoriesAdded: [],
    problems: [],
  };
  const docs: Doc[] = [];
  const extras = new Map<string, Set<string>>();

  const money = withCategories(store.get("money"), await readCategoryNames(root), report);
  if (money)
    docs.push({ ...money, data: { fields: money.data.fields }, stamps: { fields: stamp } });

  for (const { source, path } of await listNotes(root)) {
    if (source === "ledger") report.ledgerFiles++;
    const collection = collectionOf(source);
    let mapped: ReturnType<typeof mapNote>;
    try {
      const { text, createdMs } = await readVaultFile(root, path);
      mapped = mapNote(source, parseNote(text), { path, createdMs, timeZone });
    } catch (error) {
      report.problems.push(`${path}: ${(error as Error).message}`);
      continue;
    }
    const { data } = mapped;
    for (const problem of mapped.problems) report.problems.push(`${path}: ${problem}`);

    const fields = fieldsOf(collection === "money" && money ? money : store.get(collection));
    for (const key of Object.keys(data)) {
      if (!isDataKey(key)) {
        report.problems.push(`${path}: key "${key}" cannot be stored; left out`);
        delete data[key];
      } else if (!key.startsWith("_") && !fields.some((f) => f.id === key)) {
        extras.set(collection, (extras.get(collection) ?? new Set()).add(key));
      }
    }
    // An invalid value is left out for the owner to fill in, never coerced.
    for (const { key, error } of validateFields(fields, data)) {
      report.problems.push(`${path}: ${key} ${JSON.stringify(data[key])} ${error}; left out`);
      delete data[key];
    }

    if (source === "ledger") report.ledgerDocs++;
    const id = importId(path);
    if (store.get(id)) {
      report.skipped++;
      continue;
    }
    const stamps = Object.fromEntries(Object.keys(data).map((key) => [key, stamp]));
    docs.push({ id, kind: "item", collection, data, stamps, actor: IMPORT_ACTOR });
    report.added[collection] = (report.added[collection] ?? 0) + 1;
  }

  store.applyChanges(docs, IMPORT_ACTOR, now);
  for (const [collection, keys] of extras) report.extraKeys[collection] = [...keys].sort();
  return report;
}

// Adds category names from the vault that the money collection lacks. Their emoji icons are
// not Lucide names, so new options get a neutral icon and colour for the owner to change.
function withCategories(
  money: Doc | undefined,
  names: string[] | undefined,
  report: ImportReport,
): Doc | undefined {
  if (!money || !names) return undefined;
  const fields = fieldsOf(money);
  const category = fields.find((f) => f.id === "category");
  if (!category) return undefined;
  const known = new Set((category.options ?? []).map((o) => o.value));
  const missing = [...new Set(names)].filter((name) => !known.has(name));
  if (missing.length === 0) return undefined;

  report.categoriesAdded = missing;
  const options = [
    ...(category.options ?? []),
    ...missing.map((value) => ({ value, icon: "tag", color: "#8C93A0" })),
  ];
  const updated: Field[] = fields.map((f) => (f === category ? { ...f, options } : f));
  return { ...money, data: { ...money.data, fields: updated } };
}

export function formatReport(report: ImportReport): string {
  const lines = Object.entries(report.added).map(([c, n]) => `  ${c.padEnd(10)} ${n}`);
  const match = report.ledgerDocs === report.ledgerFiles ? "ok" : "MISMATCH";
  const extras = Object.entries(report.extraKeys).map(([c, keys]) => `${c}: ${keys.join(", ")}`);
  return [
    "Added:",
    ...(lines.length > 0 ? lines : ["  nothing"]),
    `Already imported, skipped: ${report.skipped}`,
    `Ledger files ${report.ledgerFiles}, ledger docs ${report.ledgerDocs}: ${match}`,
    `Kept keys that are not fields: ${extras.length > 0 ? extras.join("; ") : "none"}`,
    `Categories added: ${report.categoriesAdded.join(", ") || "none"}`,
    `Problems: ${report.problems.length}`,
    ...report.problems.map((p) => `  ${p}`),
  ].join("\n");
}

/** The first start with `VAULT_PATH` set imports once; any item in the database means done. */
export async function importIfEmpty(
  store: Store,
  vaultPath: string | undefined,
  now: number,
): Promise<ImportReport | undefined> {
  if (!vaultPath || store.hasItems()) return undefined;
  return importVault({ root: vaultPath, store, now });
}
