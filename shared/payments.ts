import { PAYMENT_ACCOUNT, PAYMENT_CATEGORY } from "./lists.ts";
import { advance, dueInstant, type ReminderLike, type Zone } from "./recurrence.ts";
import type { CollectionData, Field } from "./schema.ts";

export const PAYMENTS = "payments";
export const PAYMENT_KINDS = ["subscription", "card", "bill", "loan", "other"] as const;

const select = (id: string, name: string, values: [string, string, string][]): Field => ({
  id,
  name,
  type: "select",
  options: values.map(([value, icon, color]) => ({ value, icon, color })),
});

export const REPEAT_FIELD: Field = select("repeat", "Repeat", [
  ["none", "minus", "#8C93A0"],
  ["daily", "repeat", "#3DE0FF"],
  ["weekly", "repeat", "#3DE0FF"],
  ["monthly", "repeat", "#8B7CFF"],
  ["yearly", "repeat", "#F5C451"],
]);

/**
 * What the owner pays on a date: subscriptions, card statements, bills, loans. "Paid" logs
 * the expense and moves the same payment to its next date (M7b part 6).
 */
export const PAYMENTS_COLLECTION: CollectionData = {
  name: "Payments",
  icon: "calendar-clock",
  color: "#FF9F43",
  order: 8,
  fields: [
    select("kind", "Kind", [
      ["subscription", "repeat", "#3DE0FF"],
      ["card", "credit-card", "#8B7CFF"],
      ["bill", "receipt", "#FF9F43"],
      ["loan", "landmark", "#F5C451"],
      ["other", "ellipsis", "#8C93A0"],
    ]),
    { id: "amount", name: "Amount", type: "money" },
    { id: "approx", name: "Amount varies", type: "checkbox" },
    PAYMENT_CATEGORY,
    PAYMENT_ACCOUNT,
    { id: "due", name: "Due", type: "date", config: { withTime: true } },
    REPEAT_FIELD,
    { id: "notify_days", name: "Notify days before", type: "number" },
    { id: "autopay", name: "Autopay", type: "checkbox" },
    { id: "active", name: "Active", type: "checkbox" },
  ],
  views: [
    { id: "upcoming", name: "Upcoming", type: "payments", config: {} },
    { id: "table", name: "Table", type: "table", config: {} },
  ],
};

/** Tasks gain a repeat and a notify flag; their `due` accepts a time (seed migration 7). */
export const TASK_FIELDS: Field[] = [
  REPEAT_FIELD,
  { id: "notify", name: "Notify", type: "checkbox" },
];

export const isActive = (p: ReminderLike) => p.data.active !== false && p.data._deleted !== true;

export interface UpcomingPayment {
  id: string;
  at: number;
  overdue: boolean;
}

/** Active payments due before `to`: overdue first, then by date. */
export function upcomingPayments(
  docs: (ReminderLike & { id: string })[],
  now: number,
  to: number,
  zone: Zone,
): UpcomingPayment[] {
  return docs
    .filter(isActive)
    .map((d) => ({ id: d.id, at: dueInstant(d.data.due, zone) }))
    .filter((p): p is { id: string; at: number } => p.at !== undefined && p.at < to)
    .map((p) => ({ ...p, overdue: p.at < now }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.at - b.at);
}

/**
 * What "Paid" changes on the payment: a repeating one moves to its next date; a one-off one
 * is no longer active. The expense itself is a separate money entry.
 */
export function paidPatch(p: ReminderLike, now: number, zone: Zone): Record<string, unknown> {
  return advance(p, now, zone) ?? { active: false };
}

/** The expense a payment's "Paid" starts from; an `approx` amount is always asked for. */
export function expenseFrom(p: ReminderLike): {
  title?: string;
  amount?: number;
  category?: string;
  account?: string;
} {
  const d = p.data;
  return {
    ...(typeof d._title === "string" ? { title: d._title } : {}),
    ...(typeof d.amount === "number" && d.approx !== true ? { amount: d.amount } : {}),
    ...(typeof d.category === "string" ? { category: d.category } : {}),
    ...(typeof d.account === "string" ? { account: d.account } : {}),
  };
}

export interface PaymentGroups {
  overdue: UpcomingPayment[];
  week: UpcomingPayment[];
  later: UpcomingPayment[];
  /** Active, with no due date: shown as "Needs date" and never notified. */
  needsDate: string[];
  inactive: string[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Every payment, by when it is next due; each group sorted by that date. */
export function groupPayments(
  docs: (ReminderLike & { id: string })[],
  now: number,
  zone: Zone,
): PaymentGroups {
  const live = docs.filter((d) => d.data._deleted !== true);
  const dated = upcomingPayments(live, now, Number.POSITIVE_INFINITY, zone).sort(
    (a, b) => a.at - b.at,
  );
  return {
    overdue: dated.filter((p) => p.overdue),
    week: dated.filter((p) => !p.overdue && p.at < now + WEEK_MS),
    later: dated.filter((p) => p.at >= now + WEEK_MS),
    needsDate: live
      .filter((d) => isActive(d) && dueInstant(d.data.due, zone) === undefined)
      .map((d) => d.id),
    inactive: live.filter((d) => !isActive(d)).map((d) => d.id),
  };
}

/**
 * What the payment form still needs before it saves. A subscription needs its amount, due
 * date, a repeat and the account it is charged to; other kinds need a due date, as before.
 */
export function missingForPayment(p: {
  kind: string;
  amount: string;
  due: string;
  repeat: string;
  account: string;
}): string[] {
  if (p.kind !== "subscription") return p.due ? [] : ["due date"];
  return [
    ...(Number(p.amount) > 0 ? [] : ["amount"]),
    ...(p.due ? [] : ["due date"]),
    ...(p.repeat && p.repeat !== "none" ? [] : ["repeat"]),
    ...(p.account.trim() ? [] : ["account"]),
  ];
}
