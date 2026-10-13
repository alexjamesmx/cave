import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";

export interface ViewFilter {
  field: string;
  op: "empty" | "not-empty" | "eq" | "neq";
  value?: unknown;
}

const OPS = ["empty", "not-empty", "eq", "neq"];

export const isEmptyValue = (v: unknown) => v === undefined || v === null || v === "";

export function readFilter(config: Record<string, unknown>): ViewFilter | undefined {
  const f = config.filter as Partial<ViewFilter> | undefined;
  if (!f || typeof f.field !== "string" || !OPS.includes(f.op as string)) return undefined;
  return f as ViewFilter;
}

export function applyFilter(docs: Doc[], filter: ViewFilter | undefined): Doc[] {
  if (!filter) return docs;
  return docs.filter((doc) => {
    const v = doc.data[filter.field];
    switch (filter.op) {
      case "empty":
        return isEmptyValue(v);
      case "not-empty":
        return !isEmptyValue(v);
      case "eq":
        return v === filter.value;
      case "neq":
        return v !== filter.value;
      default:
        return true;
    }
  });
}

export interface Group {
  /** Option value, or null for items without one. */
  value: string | null;
  docs: Doc[];
}

/** One group per option in order, then "no value" (which also holds retired options). */
export function groupBy(docs: Doc[], field: Field): Group[] {
  const groups: Group[] = (field.options ?? []).map((o) => ({ value: o.value, docs: [] }));
  const none: Group = { value: null, docs: [] };
  for (const doc of docs) {
    const group = groups.find((g) => g.value === doc.data[field.id]) ?? none;
    group.docs.push(doc);
  }
  return [...groups, none];
}

/** Newest first by the collection's first date field, else by `_created`. */
export function defaultSort(docs: Doc[], fields: Field[]): Doc[] {
  const dateField = fields.find((f) => f.type === "date")?.id;
  const key = (d: Doc) => String((dateField && d.data[dateField]) || d.data._created || "");
  return [...docs].sort((a, b) => key(b).localeCompare(key(a)));
}

export const titleOf = (doc: Doc) =>
  typeof doc.data._title === "string" && doc.data._title ? doc.data._title : "Untitled";
