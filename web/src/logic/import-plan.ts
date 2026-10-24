import type { Doc, Kind } from "../../../shared/types.ts";

/** The file `GET /api/export` and `bun run export` write, as far as an import needs it. */
export interface ExportFile {
  format: 1;
  exportedAt: string;
  docs: ImportDoc[];
}

/** A doc from the file: its stamps and actor are not imported, this device writes anew. */
export type ImportDoc = Pick<Doc, "id" | "kind" | "collection" | "data">;

/** One write the import would make: the keys whose value differs from this device's copy. */
export interface PlannedWrite {
  target: Pick<Doc, "id" | "kind" | "collection">;
  patch: Record<string, unknown>;
  /** Whether this device has the doc at all. */
  isNew: boolean;
}

export interface ImportPlan {
  writes: PlannedWrite[];
  /** Docs in the file that equal this device's copy key for key. */
  unchanged: number;
}

const KINDS: readonly Kind[] = ["collection", "item", "setting"];
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads an export file; a file of another shape is refused with the reason. */
export function parseExport(
  text: string,
): { ok: true; file: ExportFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not a JSON file." };
  }
  if (!isRecord(raw) || raw.format !== 1)
    return { ok: false, error: "Not a Cave export (format 1)." };
  if (!Array.isArray(raw.docs)) return { ok: false, error: "The export has no docs list." };
  const docs: ImportDoc[] = [];
  for (const [i, d] of raw.docs.entries()) {
    if (
      !isRecord(d) ||
      typeof d.id !== "string" ||
      !KINDS.includes(d.kind as Kind) ||
      (d.collection !== null && typeof d.collection !== "string") ||
      !isRecord(d.data)
    )
      return { ok: false, error: `Doc ${i + 1} is not a Cave doc.` };
    docs.push({ id: d.id, kind: d.kind as Kind, collection: d.collection, data: d.data });
  }
  return {
    ok: true,
    file: { format: 1, exportedAt: String(raw.exportedAt ?? ""), docs },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Settings, then collections, then items, so an item's fields exist before it is checked. */
const ORDER: Record<Kind, number> = { setting: 0, collection: 1, item: 2 };

/**
 * What importing `docs` onto this device's copy (`local`) would write: for each doc, the keys
 * whose value differs. Nothing is removed: a key only in the local copy stays as it is.
 */
export function planImport(docs: ImportDoc[], local: Map<string, Doc>): ImportPlan {
  const writes: PlannedWrite[] = [];
  let unchanged = 0;
  for (const doc of docs) {
    const mine = local.get(doc.id);
    const patch = Object.fromEntries(
      Object.entries(doc.data).filter(([key, value]) => !mine || !same(mine.data[key], value)),
    );
    if (Object.keys(patch).length === 0) {
      unchanged += 1;
      continue;
    }
    writes.push({
      target: { id: doc.id, kind: doc.kind, collection: doc.collection },
      patch,
      isNew: mine === undefined,
    });
  }
  writes.sort((a, b) => ORDER[a.target.kind] - ORDER[b.target.kind]);
  return { writes, unchanged };
}
