import type { Doc } from "../../../shared/types.ts";

/**
 * Where a card sits in its column: `_order` once it has been dragged, else its creation time,
 * so new cards land at the bottom and undragged ones keep a stable order.
 */
export function rankOf(doc: Doc): number {
  if (typeof doc.data._order === "number") return doc.data._order;
  const created = Date.parse(String(doc.data._created ?? ""));
  return Number.isFinite(created) ? created : 0;
}

export const byRank = (docs: Doc[]) =>
  [...docs].sort((a, b) => rankOf(a) - rankOf(b) || a.id.localeCompare(b.id));

/** A rank between two neighbours; either side may be missing. */
export function rankBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** Task statuses that stamp when they were reached. */
const STAMPED: Record<string, "completed" | "cancelled"> = {
  done: "completed",
  dropped: "cancelled",
};

/**
 * A task moved to `status`: done stamps `completed`, dropped stamps `cancelled`, and leaving
 * either clears its stamp. Only keys that change are returned.
 */
export function statusPatch(doc: Doc, status: string, now: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (doc.data.status !== status) patch.status = status;
  for (const [value, key] of Object.entries(STAMPED)) {
    if (status === value && doc.data.status !== value) patch[key] = now;
    if (status !== value && doc.data[key] != null) patch[key] = null;
  }
  return patch;
}

export interface Drop {
  /** The dragged card. */
  doc: Doc;
  /** The grouping field and the target column's value (`null`: the "no value" column). */
  field: string;
  value: string | null;
  /** The target column's cards in order, the dragged one excluded. */
  column: Doc[];
  /** Where it lands among them, 0 = top. */
  index: number;
  /** Tasks stamp `completed` and `cancelled` on their status; other boards only set the field. */
  tasks: boolean;
  now: string;
}

/** What a drop writes: the field (with the task rules), and `_order` for the dragged card only. */
export function dropPatch(d: Drop): Record<string, unknown> {
  const patch =
    d.tasks && d.field === "status" && d.value !== null
      ? statusPatch(d.doc, d.value, d.now)
      : d.doc.data[d.field] === d.value
        ? {}
        : { [d.field]: d.value };
  const before = d.column[d.index - 1];
  const after = d.column[d.index];
  patch._order = rankBetween(
    before === undefined ? undefined : rankOf(before),
    after === undefined ? undefined : rankOf(after),
  );
  return patch;
}
