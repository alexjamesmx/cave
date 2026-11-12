import { dayOf, localDate, localDateTime } from "../../../shared/dates.ts";
import { isActive, paidPatch } from "../../../shared/payments.ts";
import {
  complete,
  dueInstant,
  isOpen,
  isOverdue,
  type Repeat,
  repeatOf,
  type Zone,
} from "../../../shared/reminders.ts";
import { completeTask } from "../../../shared/tasks.ts";
import type { Doc } from "../../../shared/types.ts";
import { statusPatch } from "./board.ts";
import { dateLabel, daysBetween, weekday } from "./calendar.ts";
import { CLOSED } from "./task-list.ts";
import { titleOf } from "./views.ts";

export type AgendaType = "reminder" | "task" | "payment";

/** The collection each type lives in. */
export const COLLECTION_OF: Record<AgendaType, string> = {
  reminder: "reminders",
  task: "tasks",
  payment: "payments",
};

/** Something with a date the owner acts on: a reminder, an open task, an active payment. */
export interface AgendaItem {
  id: string;
  type: AgendaType;
  title: string;
  /** The due instant; a reminder without a date has none. */
  at: number | undefined;
  /** Local `YYYY-MM-DD`, "" without a date. */
  day: string;
  /** `HH:mm`, or undefined for the whole day. */
  time: string | undefined;
  repeat: Repeat;
  doc: Doc;
}

/** Undated holds reminders without a date: the calendar is the only place they show. */
export const AGENDA_GROUPS = ["overdue", "today", "tomorrow", "week", "later", "undated"] as const;
export type AgendaGroupId = (typeof AGENDA_GROUPS)[number];

export interface AgendaGroup {
  id: AgendaGroupId;
  items: AgendaItem[];
}

const live = (d: Doc) => d.data._deleted !== true;

function item(type: AgendaType, doc: Doc, zone: Zone): AgendaItem {
  const due = typeof doc.data.due === "string" ? doc.data.due : "";
  return {
    id: doc.id,
    type,
    title: titleOf(doc),
    at: dueInstant(due, zone),
    day: dayOf(due) ?? "",
    time: due.length > 10 ? due.slice(11, 16) : undefined,
    repeat: repeatOf(doc.data),
    doc,
  };
}

/** Open, live tasks; done and dropped ones are off the agenda as they are off the board. */
const openTask = (d: Doc) => live(d) && !CLOSED.has(String(d.data.status));

const TYPE_ORDER: Record<AgendaType, number> = { payment: 0, task: 1, reminder: 2 };

const byTime = (a: AgendaItem, b: AgendaItem) =>
  (a.at ?? Number.POSITIVE_INFINITY) - (b.at ?? Number.POSITIVE_INFINITY) ||
  TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
  a.title.localeCompare(b.title);

/**
 * Everything with a date, by when: open reminders, open tasks with a due date and active
 * payments, in Overdue, Today, Tomorrow, This week (the next seven days), Later, then
 * reminders without a date. Only stored dates count; a repeat's later occurrences are the
 * month grid's. Each type keeps its own rule for overdue: a reminder or a payment once its
 * moment has passed, a task once its day has. Month's Upcoming and the Agenda both read this,
 * so their counts agree. Empty groups are left out.
 */
export function agenda(
  reminders: Doc[],
  tasks: Doc[],
  payments: Doc[],
  now: number,
  zone: Zone,
): AgendaGroup[] {
  const today = localDate(new Date(now), zone.timeZone);
  const groups = new Map<AgendaGroupId, AgendaItem[]>(AGENDA_GROUPS.map((g) => [g, []]));
  const place = (it: AgendaItem, overdue: boolean) => {
    const offset = it.day ? daysBetween(today, it.day) : undefined;
    const id: AgendaGroupId =
      offset === undefined
        ? "undated"
        : overdue
          ? "overdue"
          : offset <= 0
            ? "today"
            : offset === 1
              ? "tomorrow"
              : offset < 7
                ? "week"
                : "later";
    groups.get(id)?.push(it);
  };
  for (const doc of reminders.filter(isOpen))
    place(item("reminder", doc, zone), isOverdue(doc, now, zone));
  for (const doc of tasks.filter(openTask)) {
    const it = item("task", doc, zone);
    if (it.day) place(it, it.day < today);
  }
  for (const doc of payments.filter(isActive)) {
    const it = item("payment", doc, zone);
    if (it.at !== undefined) place(it, it.at < now);
  }
  return AGENDA_GROUPS.map((id) => ({ id, items: (groups.get(id) ?? []).sort(byTime) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Reminders and tasks already done that had a date, latest date first. */
export function agendaDone(reminders: Doc[], tasks: Doc[], zone: Zone): AgendaItem[] {
  return [
    ...reminders
      .filter((d) => live(d) && d.data.done === true)
      .map((d) => item("reminder", d, zone)),
    ...tasks.filter((d) => live(d) && d.data.status === "done").map((d) => item("task", d, zone)),
  ]
    .filter((it) => it.day)
    .sort((a, b) => byTime(b, a));
}

/** How many items the groups hold, in all and per group. */
export function agendaCounts(groups: AgendaGroup[]): Record<AgendaGroupId | "all", number> {
  const counts = Object.fromEntries([...AGENDA_GROUPS, "all"].map((g) => [g, 0])) as Record<
    AgendaGroupId | "all",
    number
  >;
  for (const g of groups) {
    counts[g.id] = g.items.length;
    counts.all += g.items.length;
  }
  return counts;
}

const GROUP_NAME: Record<AgendaGroupId, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  undated: "No date",
};

/** A group's heading; Today names the day ("Today · Thu 12"). */
export function groupName(id: AgendaGroupId, today: string): string {
  return id === "today" ? `Today · ${weekday(today)} ${Number(today.slice(8))}` : GROUP_NAME[id];
}

/**
 * When an item is due, short, under its group's heading: the time today and tomorrow ("All
 * day" without one), the weekday within a week either side, else the date.
 */
export function whenLabel(it: AgendaItem, group: AgendaGroupId, today: string): string {
  if (!it.day) return "No date";
  const offset = daysBetween(today, it.day);
  if (group === "today" || group === "tomorrow" || offset === 0) return it.time ?? "All day";
  if (Math.abs(offset) < 7) return weekday(it.day);
  return dateLabel(it.day, today);
}

/**
 * What ✓ writes on the item itself. A reminder completes and a task is done, each moving to
 * its next date when it repeats; a payment moves to its next date, or goes inactive when it
 * doesn't repeat. A payment's expense is a separate entry (`paidEntry`).
 */
export function donePatch(it: AgendaItem, now: number, zone: Zone): Record<string, unknown> {
  if (it.type === "reminder") return complete(it.doc, now, zone);
  if (it.type === "payment") return paidPatch(it.doc, now, zone);
  const nowLocal = localDateTime(new Date(now), zone.timeZone);
  return it.repeat === "none"
    ? statusPatch(it.doc, "done", nowLocal)
    : completeTask(it.doc, now, zone, nowLocal);
}

/**
 * The quick add's time for a reminder today, `HH:mm`: the reminder time, or the next full hour
 * once it has passed (`now` is the local time), so a new reminder isn't overdue as it is saved.
 */
export function todayTime(defaultTime: string, now: string): string {
  if (defaultTime > now) return defaultTime;
  const hour = Number(now.slice(0, 2)) + 1;
  return hour > 23 ? "23:59" : `${String(hour).padStart(2, "0")}:00`;
}
