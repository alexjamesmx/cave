import { dueInstant, isOpen, repeatOf, type Zone } from "../../shared/reminders.ts";
import type { Doc } from "../../shared/types.ts";
import { every, type Job } from "../jobs/scheduler.ts";
import type { Store } from "../store.ts";
import type { Notifier, SentLog } from "./notifier.ts";
import type { Notification } from "./types.ts";

/** A reminder due longer ago than this when the server sees it is missed, not sent: no burst. */
export const CATCH_UP_MS = 6 * 60 * 60 * 1000;
export const SWEEP_MS = 30_000;

/**
 * Whether a late send was timed before the item existed (a reminder added with a time long
 * past, a payment's day-before notice for one added that evening). Nothing was missed then,
 * so the sweeps skip it instead of logging it as missed. Unknown when `_created` is absent.
 */
export const predates = (doc: Doc, at: number) =>
  at < Date.parse(typeof doc.data._created === "string" ? doc.data._created : "");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu Oct 22, 09:00" from a local `due`; a date-only one reads at the reminder time. */
export function describeDue(due: string, zone: Zone): string {
  const [y, m, d] = due.slice(0, 10).split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const time = due.length > 10 ? due.slice(11, 16) : zone.defaultTime;
  return `${weekday} ${MONTHS[m - 1]} ${d}, ${time}`;
}

export const reminderKey = (id: string, due: string) => `reminder:${id}:${due}`;

/** The reminder as every channel gets it; the notifier decides how much each one sees. */
export function reminderNotification(doc: Doc, zone: Zone): Notification {
  const due = doc.data.due as string;
  const repeat = repeatOf(doc.data);
  const title =
    typeof doc.data._title === "string" && doc.data._title ? doc.data._title : "Reminder";
  return {
    key: reminderKey(doc.id, due),
    kind: "reminder",
    itemId: doc.id,
    title,
    details: [describeDue(due, zone), ...(repeat === "none" ? [] : [`Repeats ${repeat}`])],
    path: `/r/${doc.id}`,
    tag: `reminder:${doc.id}`,
    actions: [
      { id: "done", label: "Done", path: `/r/${doc.id}?do=done` },
      { id: "snooze60", label: "Snooze 1h", path: `/r/${doc.id}?do=snooze60` },
    ],
  };
}

export interface SweepOptions {
  store: Store;
  notifier: Notifier;
  sent: SentLog;
  zone: () => Zone;
}

/**
 * Every 30 seconds: open reminders whose due is at or before now and whose key hasn't been
 * sent. The key holds `due`, so a snooze or the next repeat notifies again at its new time,
 * and a key already recorded never sends twice, across restarts too.
 */
export function createReminderSweep({ store, notifier, sent, zone }: SweepOptions): Job {
  return {
    id: "reminders",
    label: "Reminder notifications",
    describeSchedule: () => "every 30 seconds",
    nextRun: every(SWEEP_MS),
    async run({ now }) {
      const z = zone();
      let delivered = 0;
      let missed = 0;
      for (const doc of store.itemsOf("reminders")) {
        if (!isOpen(doc) || typeof doc.data.due !== "string") continue;
        const at = dueInstant(doc.data.due, z);
        if (at === undefined || at > now) continue;
        const key = reminderKey(doc.id, doc.data.due);
        if (sent.wasSent(key)) continue;
        if (now - at > CATCH_UP_MS) {
          if (predates(doc, at)) continue;
          sent.markMissed(key, doc.id, now);
          missed += 1;
          continue;
        }
        const result = await notifier.notify(reminderNotification(doc, z));
        sent.markSent(key, doc.id, now, result);
        delivered += 1;
      }
      return {
        result: "ok",
        summary: `${delivered} sent, ${missed} missed`,
        didSomething: delivered + missed > 0,
      };
    },
  };
}
