import { dayOf } from "../../../shared/dates.ts";
import type { SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { dateLabel, daysBetween, weekday } from "./calendar.ts";

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

interface Drop {
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

/** A card's box on screen, in viewport pixels. */
export interface CardBox {
  top: number;
  height: number;
}

/**
 * The slot a card dropped at height `y` takes among a column's other cards, in order: before
 * the first whose middle is below `y`, else after the last. A drop anywhere under the cards,
 * or in an empty column, appends.
 */
export function dropIndex(cards: readonly CardBox[], y: number): number {
  const index = cards.findIndex((c) => y < c.top + c.height / 2);
  return index === -1 ? cards.length : index;
}

/** A column's heading: the option's label, else its value as a word ("todo" reads "To do"). */
export function columnName(option: Pick<SelectOption, "value" | "label">): string {
  if (option.label) return option.label;
  if (option.value === "todo") return "To do";
  return option.value.charAt(0).toUpperCase() + option.value.slice(1);
}

export type DueTone = "bad" | "warn" | "plain";

/** Within this many days a due date reads as a weekday ("Fri 14"), else as a date. */
const WEEKDAY_SPAN = 14;

/**
 * A task's due date relative to `today`: "Overdue · 1 day", "Today · 17:00", "Tomorrow",
 * "Fri 14 · 08:00" for the next two weeks, then "Nov 30". Overdue once its day has passed, as
 * the calendar has it.
 */
export function dueLabel(due: unknown, today: string): { text: string; tone: DueTone } {
  const day = dayOf(due);
  if (!day) return { text: "No date", tone: "plain" };
  const time = typeof due === "string" && due.length > 10 ? ` · ${due.slice(11, 16)}` : "";
  const offset = daysBetween(today, day);
  if (offset < 0)
    return { text: `Overdue · ${-offset} day${offset === -1 ? "" : "s"}`, tone: "bad" };
  if (offset === 0) return { text: `Today${time}`, tone: "warn" };
  if (offset === 1) return { text: `Tomorrow${time}`, tone: "plain" };
  if (offset < WEEKDAY_SPAN)
    return { text: `${weekday(day)} ${Number(day.slice(8))}${time}`, tone: "plain" };
  return { text: `${dateLabel(day, today)}${time}`, tone: "plain" };
}
