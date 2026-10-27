import { isActive, PAYMENTS } from "../../shared/payments.ts";
import { dueInstant, type Zone } from "../../shared/recurrence.ts";
import type { Doc } from "../../shared/types.ts";
import { every, type Job } from "../jobs/scheduler.ts";
import type { Store } from "../store.ts";
import type { Notifier, SentLog } from "./notifier.ts";
import { CATCH_UP_MS, describeDue, predates, SWEEP_MS } from "./reminder-sweep.ts";
import type { Notification } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `notify_days` as set on the payment, else 1; a negative or broken value counts as 1. */
const notifyDaysOf = (doc: Doc) => {
  const n = doc.data.notify_days;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 1;
};

type When = "before" | "due";

/** Names one send for one due date: a paid or advanced payment never sends for the old one. */
const paymentKey = (id: string, due: string, when: When) => `payment:${id}:${due}:${when}`;

const dueIn = (days: number) => (days === 1 ? "due tomorrow" : `due in ${days} days`);

/**
 * The title carries the wording ("due tomorrow", "charged today"), so a titles-only channel
 * still says what's happening; the amount stays in the details, shown only at full detail.
 */
function paymentNotification(doc: Doc, when: When, zone: Zone): Notification {
  const due = doc.data.due as string;
  const name = typeof doc.data._title === "string" && doc.data._title ? doc.data._title : "Payment";
  const autopay = doc.data.autopay === true;
  const wording =
    when === "before" ? dueIn(notifyDaysOf(doc)) : autopay ? "charged today" : "due today";
  const amount = doc.data.amount;
  return {
    key: paymentKey(doc.id, due, when),
    kind: "payment",
    itemId: doc.id,
    title: `${name} · ${wording}`,
    details: [
      describeDue(due, zone),
      ...(typeof amount === "number"
        ? [`${doc.data.approx === true ? "About " : ""}$${amount.toLocaleString("en-US")}`]
        : []),
    ],
    path: "/money/subscriptions",
    tag: `payment:${doc.id}`,
  };
}

/** When each send for this payment is due; an autopay one only tells on the day. */
function paymentSends(doc: Doc, zone: Zone): { when: When; at: number }[] {
  if (!isActive(doc) || typeof doc.data.due !== "string") return [];
  const at = dueInstant(doc.data.due, zone);
  if (at === undefined) return [];
  const days = notifyDaysOf(doc);
  const before =
    doc.data.autopay === true || days === 0
      ? []
      : [{ when: "before" as const, at: at - days * DAY_MS }];
  return [...before, { when: "due", at }];
}

interface PaymentSweepOptions {
  store: Store;
  notifier: Notifier;
  sent: SentLog;
  zone: () => Zone;
}

/**
 * Every 30 seconds, like the reminder sweep: each active payment with a due date notifies
 * `notify_days` before it (default 1) and on the day, each once per due date. A send more than
 * 6 hours late is recorded as missed, and a "before" that is only seen after the due time is
 * dropped, since the day's own notification says it.
 */
export function createPaymentSweep({ store, notifier, sent, zone }: PaymentSweepOptions): Job {
  return {
    id: "payments",
    label: "Payment notifications",
    describeSchedule: () => "every 30 seconds",
    nextRun: every(SWEEP_MS),
    async run({ now }) {
      const z = zone();
      let delivered = 0;
      let missed = 0;
      for (const doc of store.itemsOf(PAYMENTS)) {
        const sends = paymentSends(doc, z);
        const dueAt = sends.at(-1)?.at;
        for (const { when, at } of sends) {
          if (at > now) continue;
          const key = paymentKey(doc.id, doc.data.due as string, when);
          if (sent.wasSent(key)) continue;
          if (
            now - at > CATCH_UP_MS ||
            (when === "before" && dueAt !== undefined && now >= dueAt)
          ) {
            if (predates(doc, at)) continue;
            sent.markMissed(key, doc.id, now);
            missed += 1;
            continue;
          }
          const result = await notifier.notify(paymentNotification(doc, when, z));
          sent.markSent(key, doc.id, now, result);
          delivered += 1;
        }
      }
      return {
        result: "ok",
        summary: `${delivered} sent, ${missed} missed`,
        didSomething: delivered + missed > 0,
      };
    },
  };
}
