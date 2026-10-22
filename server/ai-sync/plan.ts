import { createHash } from "node:crypto";
import { AI } from "../../shared/ai.ts";
import type { Doc } from "../../shared/types.ts";
import type { AiItem } from "./collect.ts";

export const hashOf = (body: string) =>
  createHash("sha256").update(body).digest("hex").slice(0, 32);

/** Re-runs update the same item: its id comes from where it was read. */
export const aiId = (source: string) => `ai-${hashOf(source).slice(0, 20)}`;

interface SyncPlan {
  /** Item data to write, by id (only the keys that change). */
  push: { id: string; data: Record<string, unknown> }[];
  /** Edited in the Cave since the last sync; `--apply` writes these back. */
  edited: Doc[];
  /** Deleted in the Cave; `--apply` moves their files to `.ai-trash/`. */
  deleted: Doc[];
  /** Changed in both places since the last sync: nothing is pushed; the owner decides. */
  conflicts: Doc[];
  unchanged: number;
}

const META = ["_title", "kind", "surface", "scope", "source"] as const;

/**
 * What a sync does. A file that changed is pushed unless its item was edited in the Cave since
 * the last sync (its body no longer hashes to `_syncHash`): then the Cave's edit waits for
 * `--apply`, and an item changed on both sides is a conflict. Nothing is ever deleted.
 */
export function planSync(items: AiItem[], server: Doc[]): SyncPlan {
  const byId = new Map(server.filter((d) => d.collection === AI).map((d) => [d.id, d]));
  const plan: SyncPlan = { push: [], edited: [], deleted: [], conflicts: [], unchanged: 0 };
  const seen = new Set<string>();

  for (const item of items) {
    const id = aiId(item.source);
    seen.add(id);
    const doc = byId.get(id);
    const meta = {
      _title: item.title,
      kind: item.kind,
      surface: item.surface,
      scope: item.scope,
      source: item.source,
    };
    const fileHash = hashOf(item.body);
    if (!doc) {
      plan.push.push({
        id,
        data: { ...meta, status: "active", _body: item.body, _syncHash: fileHash },
      });
      continue;
    }
    if (doc.data._deleted === true) {
      plan.deleted.push(doc);
      continue;
    }
    const last = typeof doc.data._syncHash === "string" ? doc.data._syncHash : "";
    const caveBody = typeof doc.data._body === "string" ? doc.data._body : "";
    const editedInCave = hashOf(caveBody) !== last;
    const fileChanged = fileHash !== last;
    const metaChanges = Object.fromEntries(
      META.filter((k) => doc.data[k] !== meta[k]).map((k) => [k, meta[k]]),
    );
    if (editedInCave && fileChanged && caveBody !== item.body) plan.conflicts.push(doc);
    else if (editedInCave && caveBody !== item.body) plan.edited.push(doc);
    else if (fileChanged || editedInCave)
      plan.push.push({ id, data: { ...metaChanges, _body: item.body, _syncHash: fileHash } });
    else if (Object.keys(metaChanges).length > 0) plan.push.push({ id, data: metaChanges });
    else plan.unchanged++;
  }
  // Deleted items not read this time are offered too; one whose file is gone is skipped then.
  for (const doc of byId.values())
    if (!seen.has(doc.id) && doc.data._deleted === true && typeof doc.data.source === "string")
      plan.deleted.push(doc);
  return plan;
}
