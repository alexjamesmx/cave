import type { Condition } from "./registry.ts";

const empty = (v: unknown) => v === undefined || v === null || v === "";

/** One condition against an item's data; `title` reads the item's title. */
export function holds(c: Condition, data: Record<string, unknown>): boolean {
  const actual = data[c.field === "title" ? "_title" : c.field];
  if (c.op === "empty") return empty(actual);
  if (c.op === "not-empty") return !empty(actual);
  if (empty(actual)) return c.op === "!=";
  const want = c.value;
  // Numbers compare as numbers; everything else, dates included, as text.
  const numeric =
    typeof actual === "number" && want !== null && want !== "" && Number.isFinite(Number(want));
  const a = numeric ? (actual as number) : String(actual);
  const b = numeric ? Number(want) : String(want ?? "");
  switch (c.op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "contains":
      return String(actual)
        .toLowerCase()
        .includes(String(want ?? "").toLowerCase());
  }
}

export const allHold = (conditions: Condition[] | undefined, data: Record<string, unknown>) =>
  (conditions ?? []).every((c) => holds(c, data));
