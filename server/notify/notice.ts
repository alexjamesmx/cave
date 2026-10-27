import { budgetLine, budgetOf } from "../../shared/budget.ts";
import { transferCategories } from "../../shared/categories.ts";
import { daysInMonth, localDate, monthOf } from "../../shared/dates.ts";
import { fieldsOf } from "../../shared/fields.ts";
import { monthSummary } from "../../shared/money.ts";
import { PAYMENTS } from "../../shared/payments.ts";
import { repeatOf, type Zone } from "../../shared/recurrence.ts";
import type { Doc } from "../../shared/types.ts";
import type { Store } from "../store.ts";
import type { Notification } from "./types.ts";

/** The budget a flow's "When spending reaches" sees: not stored, so it is never an item. */
export const BUDGET = "budget";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const titleOf = (d: Doc, fallback: string) =>
  typeof d.data._title === "string" && d.data._title ? d.data._title : fallback;

/** "Thu Oct 22, 09:00" from a local `due`; a date-only one reads at the reminder time. */
export function describeDue(due: string, zone: Zone): string {
  const [y, m, d] = due.slice(0, 10).split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const time = due.length > 10 ? due.slice(11, 16) : zone.defaultTime;
  return `${weekday} ${MONTHS[m - 1]} ${d}, ${time}`;
}

/** The month's spending against the limit, as Money's Overview counts it; none without a limit. */
export function budgetState(store: Store, now: number, zone: Zone): Doc | undefined {
  const limit = budgetOf(store.get("settings")?.data).monthlyLimit;
  if (limit === undefined) return undefined;
  const today = localDate(new Date(now), zone.timeZone);
  const month = monthOf(today);
  const categories = fieldsOf(store.get("money")).find((f) => f.id === "category");
  const s = monthSummary(store.itemsOf("money"), month, today, transferCategories(categories));
  const line = budgetLine(limit, s.spent, s.daysElapsed, daysInMonth(month));
  return {
    id: `${BUDGET}:${month}`,
    kind: "item",
    collection: BUDGET,
    data: {
      _title: "Budget",
      month,
      spent: Math.round(line.spent),
      limit,
      left: Math.round(line.left),
      percent: Math.floor((line.spent / limit) * 100),
      ...(line.pace !== undefined ? { pace: Math.round(line.pace) } : {}),
    },
    stamps: {},
    actor: "cave",
  };
}

/**
 * What a notification about an item says and does, by what the item is: a reminder opens its
 * own page with Done and Snooze, a payment its list, the budget Money's Overview; anything
 * else its collection. A flow's notify step uses it when it opens the trigger item, so a
 * flow knows nothing of any of this.
 */
export function noticeFor(
  item: Doc,
  zone: Zone,
): Pick<Notification, "kind" | "itemId" | "path" | "tag" | "actions" | "details"> {
  const due = typeof item.data.due === "string" ? item.data.due : undefined;
  if (item.collection === "reminders") {
    const repeat = repeatOf(item.data);
    return {
      kind: "reminder",
      itemId: item.id,
      path: `/r/${item.id}`,
      tag: `reminder:${item.id}`,
      details: [
        ...(due ? [describeDue(due, zone)] : []),
        ...(repeat === "none" ? [] : [`Repeats ${repeat}`]),
      ],
      actions: [
        { id: "done", label: "Done", path: `/r/${item.id}?do=done` },
        { id: "snooze60", label: "Snooze 1h", path: `/r/${item.id}?do=snooze60` },
      ],
    };
  }
  if (item.collection === PAYMENTS) {
    const amount = item.data.amount;
    return {
      kind: "payment",
      itemId: item.id,
      path: "/settings/data/payments/upcoming",
      tag: `payment:${item.id}`,
      details: [
        ...(due ? [describeDue(due, zone)] : []),
        ...(typeof amount === "number"
          ? [`${item.data.approx === true ? "About " : ""}${money(amount)}`]
          : []),
      ],
    };
  }
  if (item.collection === BUDGET) {
    const d = item.data as Record<string, number | string>;
    const left = Number(d.left);
    return {
      kind: "budget",
      path: "/money/overview",
      tag: `budget:${d.month}`,
      details: [
        `${money(Number(d.spent))} of ${money(Number(d.limit))}`,
        left >= 0 ? `${money(left)} left` : `${money(-left)} over`,
        ...(d.pace !== undefined ? [`At this rate: ${money(Number(d.pace))} by month end`] : []),
      ],
    };
  }
  return {
    kind: "message",
    itemId: item.id,
    path: `/c/${item.collection}`,
    details: [titleOf(item, "")].filter(Boolean),
  };
}
