import type { Change, Doc } from "./types.ts";

export interface UndoPlan {
  /** Keys to write back; empty when nothing can be undone. */
  patch: Record<string, unknown>;
  /** Keys left alone, with why. */
  skipped: { key: string; reason: string }[];
}

/** A change whose keys were all new and which set `_created` made the doc. */
const createdDoc = (change: Change) =>
  change.keys.includes("_created") &&
  change.before !== null &&
  change.keys.every((key) => change.before?.[key] === null);

/**
 * What undoing `change` writes, given the doc as it is now. A key is restored only while its
 * stamp is still the one the change gave it: a key edited since then is reported, never
 * overwritten. Undoing the change that created a doc deletes it (`_deleted`, which itself
 * can be undone). The caller writes the patch like any edit, so it syncs and is logged.
 */
export function undoPatch(change: Change, current: Doc | undefined): UndoPlan {
  const all = (reason: string): UndoPlan => ({
    patch: {},
    skipped: change.keys.map((key) => ({ key, reason })),
  });
  const { before, after } = change;
  if (before === null || after === null) return all("recorded before undo was possible");
  if (!current) return all("the item no longer exists");

  if (createdDoc(change)) {
    if (current.data._deleted === true) return all("already deleted");
    return { patch: { _deleted: true }, skipped: [] };
  }

  const patch: Record<string, unknown> = {};
  const skipped: UndoPlan["skipped"] = [];
  for (const key of change.keys) {
    if (current.stamps[key] !== after[key]) {
      skipped.push({ key, reason: "changed since" });
      continue;
    }
    const previous = before[key];
    patch[key] = previous === null || previous === undefined ? null : previous.value;
  }
  return { patch, skipped };
}
