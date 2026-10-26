import { normTitle } from "../../../shared/money-stats.ts";
import type { Doc } from "../../../shared/types.ts";
import { titleOf } from "./views.ts";

export const TASK_CHIPS = ["open", "done", "dropped", "all"] as const;
export type TaskChip = (typeof TASK_CHIPS)[number];

/** The statuses that leave the board unless Show done is on. */
export const CLOSED = new Set(["done", "dropped"]);

const chipOf = (d: Doc): Exclude<TaskChip, "all"> =>
  d.data.status === "done" ? "done" : d.data.status === "dropped" ? "dropped" : "open";

const PRIORITY: Record<string, number> = { high: 0, normal: 1, low: 2 };

/**
 * Tasks → List: live tasks by chip and text. Open ones read by due date (soonest first, no date
 * last), then priority; Done and Dropped by when they closed, latest first. `counts` is per chip
 * after the text filter.
 */
export function taskList(items: Doc[], chip: TaskChip, text: string) {
  const needle = normTitle(text);
  const live = items.filter(
    (d) =>
      d.data._deleted !== true &&
      (!needle || normTitle(`${titleOf(d)} ${d.data._body ?? ""}`).includes(needle)),
  );
  const counts: Record<TaskChip, number> = { open: 0, done: 0, dropped: 0, all: live.length };
  for (const d of live) counts[chipOf(d)]++;
  const shown = chip === "all" ? live : live.filter((d) => chipOf(d) === chip);
  const due = (d: Doc) => (typeof d.data.due === "string" ? d.data.due : "￿");
  const closed = (d: Doc) => String(d.data.completed ?? d.data.cancelled ?? d.data._created ?? "");
  const rows = [...shown].sort((a, b) => {
    if (chip === "done" || chip === "dropped") return closed(b).localeCompare(closed(a));
    return (
      due(a).localeCompare(due(b)) ||
      (PRIORITY[String(a.data.priority)] ?? 1) - (PRIORITY[String(b.data.priority)] ?? 1) ||
      titleOf(a).localeCompare(titleOf(b))
    );
  });
  return { rows, counts };
}

/** `?chip=` and `?q=` of Tasks → List; Open and empty stay out of the address. */
export function taskQueryFromSearch(search: string): { chip: TaskChip; text: string } {
  const p = new URLSearchParams(search);
  const chip = p.get("chip") as TaskChip | null;
  return { chip: chip && TASK_CHIPS.includes(chip) ? chip : "open", text: p.get("q") ?? "" };
}

export function taskQueryToSearch(q: { chip: TaskChip; text: string }): string {
  const p = new URLSearchParams();
  if (q.chip !== "open") p.set("chip", q.chip);
  if (q.text) p.set("q", q.text);
  const s = p.toString();
  return s ? `?${s}` : "";
}
