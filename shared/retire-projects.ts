import type { CollectionData, Field } from "./schema.ts";
import type { Doc, Kind } from "./types.ts";

type SeedDoc = { id: string; kind: Kind; collection?: string; data: Record<string, unknown> };

/** The collections the Projects feature owned (M8 to M11): the projects, their parts, agents' runs. */
export const RETIRED_COLLECTIONS = ["projects", "parts", "runs"];

/** Collections whose items could point at a project (`project`), and tasks at a part (`part`). */
const LINKED = ["tasks", "ideas", "leetcode", "reminders", "payments", "money", "flows", "notes"];

const isRetiredRef = (collection: string, f: Field) =>
  f.type === "ref" &&
  f.archived !== true &&
  (f.id === "project" || (collection === "tasks" && f.id === "part"));

/**
 * Seed migration 24: Projects is gone (2026-11-08). The three collections and every live item in
 * them are marked deleted, never removed, so they stay in every copy and backup and undo still
 * works. The `project` and `part` ref fields are archived: hidden everywhere, their values kept.
 * The stored project templates are cleared. Running it again on its own output does nothing.
 */
export function retireProjectsMigration(
  get: (id: string) => Doc | undefined,
  items: (collection: string) => Doc[],
): SeedDoc[] {
  const docs: SeedDoc[] = [];
  for (const id of RETIRED_COLLECTIONS) {
    const collection = get(id);
    if (!collection || collection.data._deleted === true) continue;
    docs.push({ id, kind: "collection", data: { _deleted: true } });
    for (const item of items(id))
      if (item.data._deleted !== true)
        docs.push({ id: item.id, kind: "item", collection: id, data: { _deleted: true } });
  }
  for (const id of LINKED) {
    const doc = get(id);
    if (doc?.kind !== "collection" || doc.data._deleted === true) continue;
    const fields = (doc.data as unknown as CollectionData).fields;
    if (!Array.isArray(fields) || !fields.some((f) => isRetiredRef(id, f))) continue;
    const next = fields.map((f) => (isRetiredRef(id, f) ? { ...f, archived: true } : f));
    docs.push({ id, kind: "collection", data: { fields: next } });
  }
  const settings = get("settings");
  const templates = settings?.data.projectTemplates;
  if (settings?.kind === "setting" && templates !== undefined && templates !== null)
    docs.push({ id: "settings", kind: "setting", data: { projectTemplates: null } });
  return docs;
}
