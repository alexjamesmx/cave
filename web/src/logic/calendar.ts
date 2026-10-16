import { dayOf, localDateTime } from "../../../shared/dates.ts";
import { parseDefinition } from "../../../shared/flows/registry.ts";
import { nextSlot } from "../../../shared/flows/schedule.ts";
import { isActive } from "../../../shared/payments.ts";
import {
  dueInstant,
  isOpen,
  isOverdue,
  repeatOf,
  upcoming,
  type Zone,
} from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import { titleOf } from "./views.ts";

/** UTC instants; `to` is exclusive. */
export interface Range {
  from: number;
  to: number;
}

export interface CalendarEvent {
  /** Unique per entry: a repeat's computed occurrences share the item's id. */
  key: string;
  itemId: string;
  collection: string;
  title: string;
  /** Local `YYYY-MM-DD[THH:mm]`. */
  due: string;
  day: string;
  /** `HH:mm`, or undefined for an all-day entry. */
  time: string | undefined;
  at: number;
  done: boolean;
  overdue: boolean;
  /** A computed future occurrence of a repeating reminder, not a stored one. */
  repeat: boolean;
}

/**
 * Something the calendar reads entries from. Reminders, tasks and flows' next runs are built
 * in; external calendars (Google Calendar, CalDAV) are more sources behind the same
 * interface. Writing to an external calendar will be a `CalendarTarget`, not built yet.
 */
export interface CalendarSource {
  id: string;
  label: string;
  events(range: Range): CalendarEvent[];
}

function entry(doc: Doc, due: string, at: number, extra: Partial<CalendarEvent>): CalendarEvent {
  return {
    key: doc.id,
    itemId: doc.id,
    collection: doc.collection as string,
    title: titleOf(doc),
    due,
    day: due.slice(0, 10),
    time: due.length > 10 ? due.slice(11, 16) : undefined,
    at,
    done: false,
    overdue: false,
    repeat: false,
    ...extra,
  };
}

/** Reminders by `due`, done ones included (dimmed), plus a repeat's computed occurrences. */
export function reminderSource(docs: Doc[], zone: Zone, now: number): CalendarSource {
  return {
    id: "reminders",
    label: "Reminders",
    events({ from, to }) {
      const found: CalendarEvent[] = [];
      for (const doc of docs) {
        if (doc.data._deleted === true || typeof doc.data.due !== "string") continue;
        const at = dueInstant(doc.data.due, zone);
        if (at === undefined) continue;
        if (at >= from && at < to) {
          const done = !isOpen(doc);
          found.push(entry(doc, doc.data.due, at, { done, overdue: isOverdue(doc, now, zone) }));
        }
        if (repeatOf(doc.data) === "none") continue;
        for (const next of upcoming(doc, from, to - 1, zone)) {
          const nextAt = dueInstant(next, zone) as number;
          found.push(entry(doc, next, nextAt, { key: `${doc.id}@${next}`, repeat: true }));
        }
      }
      return found;
    },
  };
}

const CLOSED_TASKS = new Set(["done", "dropped"]);

/** Open tasks by their `due` day, overdue once that day has passed. */
export function taskSource(docs: Doc[], zone: Zone, today: string): CalendarSource {
  return {
    id: "tasks",
    label: "Tasks",
    events({ from, to }) {
      const found: CalendarEvent[] = [];
      for (const doc of docs) {
        const day = dayOf(doc.data.due);
        if (doc.data._deleted === true || CLOSED_TASKS.has(String(doc.data.status)) || !day)
          continue;
        const at = dueInstant(day, zone);
        if (at === undefined || at < from || at >= to) continue;
        found.push(entry(doc, day, at, { overdue: day < today }));
      }
      return found;
    },
  };
}

/** The next run of each flow that is on and runs on a schedule; it opens the flow. */
export function flowSource(docs: Doc[], zone: Zone, now: number): CalendarSource {
  return {
    id: "flows",
    label: "Flows",
    events({ from, to }) {
      const found: CalendarEvent[] = [];
      for (const doc of docs) {
        if (doc.data._deleted === true || doc.data.status !== "on") continue;
        const parsed = parseDefinition(doc.data.definition);
        if (!parsed.ok || parsed.value.trigger.type !== "schedule") continue;
        const at = nextSlot(parsed.value.trigger, now, zone.timeZone);
        if (at === undefined || at < from || at >= to) continue;
        found.push(entry(doc, localDateTime(new Date(at), zone.timeZone), at, {}));
      }
      return found;
    },
  };
}

/** Active payments by `due`, with their repeats ahead; overdue once past. */
export function paymentSource(docs: Doc[], zone: Zone, now: number): CalendarSource {
  const reminders = reminderSource(docs.filter(isActive), zone, now);
  return { id: "payments", label: "Payments", events: reminders.events };
}

/** Every source's entries in time order; within a moment, open before done. */
export function mergeEvents(sources: CalendarSource[], range: Range): CalendarEvent[] {
  return sources
    .flatMap((s) => s.events(range))
    .sort((a, b) => a.at - b.at || Number(a.done) - Number(b.done) || a.key.localeCompare(b.key));
}

export function byDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) map.set(e.day, [...(map.get(e.day) ?? []), e]);
  return map;
}
