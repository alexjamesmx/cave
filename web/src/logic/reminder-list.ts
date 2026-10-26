import { shortDay } from "../../../shared/dates.ts";
import { normTitle } from "../../../shared/money-stats.ts";
import {
  dueInstant,
  isOpen,
  isOverdue,
  REPEATS,
  type Repeat,
  repeatOf,
  type Zone,
} from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import { titleOf } from "./views.ts";

export const REMINDER_CHIPS = ["upcoming", "overdue", "done", "all"] as const;
export type ReminderChip = (typeof REMINDER_CHIPS)[number];

export interface ReminderQuery {
  chip: ReminderChip;
  repeat: Repeat | "";
  text: string;
}

export interface ReminderGroup {
  /** The due day, `YYYY-MM-DD`, or "" for reminders without one. */
  key: string;
  rows: Doc[];
}

const day = (d: Doc) => (typeof d.data.due === "string" ? d.data.due.slice(0, 10) : "");

/** The chip a live reminder falls under, besides All. */
export function chipOf(d: Doc, now: number, zone: Zone): Exclude<ReminderChip, "all"> {
  if (!isOpen(d)) return "done";
  return isOverdue(d, now, zone) ? "overdue" : "upcoming";
}

/**
 * Calendar → Reminders: live reminders filtered by chip, repeat and text, grouped by due day.
 * Upcoming and Overdue read soonest first, Done and All latest first; a reminder without a
 * date comes last. `counts` is per chip before the chip filter, so every chip shows its size.
 */
export function reminderList(items: Doc[], q: ReminderQuery, now: number, zone: Zone) {
  const needle = normTitle(q.text);
  const live = items.filter(
    (d) =>
      d.data._deleted !== true &&
      (!q.repeat || repeatOf(d.data) === q.repeat) &&
      (!needle || normTitle(`${titleOf(d)} ${d.data._body ?? ""}`).includes(needle)),
  );
  const counts: Record<ReminderChip, number> = { upcoming: 0, overdue: 0, done: 0, all: 0 };
  for (const d of live) {
    counts[chipOf(d, now, zone)]++;
    counts.all++;
  }
  const shown = q.chip === "all" ? live : live.filter((d) => chipOf(d, now, zone) === q.chip);
  const latestFirst = q.chip === "done" || q.chip === "all";
  const at = (d: Doc) => dueInstant(d.data.due, zone) ?? Number.POSITIVE_INFINITY;
  const sorted = [...shown].sort((a, b) => {
    const [x, y] = [at(a), at(b)];
    if (x === y) return titleOf(a).localeCompare(titleOf(b));
    if (!Number.isFinite(x)) return 1;
    if (!Number.isFinite(y)) return -1;
    return latestFirst ? y - x : x - y;
  });
  const groups: ReminderGroup[] = [];
  for (const d of sorted) {
    const key = day(d);
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(d);
    else groups.push({ key, rows: [d] });
  }
  return { groups, counts, total: shown.length };
}

/** A group's heading: Today, Tomorrow, Yesterday or the short date; "No date" without one. */
export function dayLabel(key: string, today: string): string {
  if (!key) return "No date";
  const offset = Math.round(
    (Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return key.slice(0, 4) === today.slice(0, 4)
    ? shortDay(key)
    : `${shortDay(key)} ${key.slice(0, 4)}`;
}

export function reminderQueryFromSearch(search: string): ReminderQuery {
  const p = new URLSearchParams(search);
  const chip = p.get("chip") as ReminderChip | null;
  const repeat = p.get("repeat") as Repeat | null;
  return {
    chip: chip && REMINDER_CHIPS.includes(chip) ? chip : "upcoming",
    repeat: repeat && REPEATS.includes(repeat) ? repeat : "",
    text: p.get("q") ?? "",
  };
}

export function reminderQueryToSearch(q: ReminderQuery): string {
  const p = new URLSearchParams();
  if (q.chip !== "upcoming") p.set("chip", q.chip);
  if (q.repeat) p.set("repeat", q.repeat);
  if (q.text) p.set("q", q.text);
  const s = p.toString();
  return s ? `?${s}` : "";
}
