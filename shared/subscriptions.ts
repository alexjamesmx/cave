import { daysInMonth, shiftMonth } from "./dates.ts";
import { isActive } from "./payments.ts";
import type { Doc } from "./types.ts";

/**
 * Subscriptions: payments of kind `subscription`, read for Money → Subscriptions. What they
 * cost a month, the charges already paid for each, and the names charged as subscriptions that
 * have no payment yet. Pure, so the page and its tests read the same numbers.
 */

export const SUBSCRIPTION_CATEGORY = "subscriptions";

const live = (d: Doc) => d.data._deleted !== true;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const amountOf = (d: Doc) => (typeof d.data.amount === "number" ? d.data.amount : 0);

/** A name as charges are matched: case and spacing aside, "Eleven labs" is "eleven  Labs". */
export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** How often a repeat happens in a month; a one-off counts for nothing. */
const PER_MONTH: Record<string, number> = {
  daily: 365 / 12,
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

/** What a subscription costs a month at its repeat. */
export const monthlyCost = (sub: Doc) => amountOf(sub) * (PER_MONTH[text(sub.data.repeat)] ?? 0);

export function subscriptionsOf(payments: Doc[]): { active: Doc[]; cancelled: Doc[] } {
  const subs = payments
    .filter((d) => live(d) && d.data.kind === "subscription")
    .sort((a, b) => text(a.data._title).localeCompare(text(b.data._title)));
  return { active: subs.filter(isActive), cancelled: subs.filter((d) => !isActive(d)) };
}

/** The active ones' cost a month, and whether any amount only estimates. */
export function monthlyTotal(active: Doc[]): { total: number; approx: boolean } {
  return {
    total: active.reduce((sum, s) => sum + monthlyCost(s), 0),
    approx: active.some((s) => s.data.approx === true),
  };
}

/**
 * A subscription's past charges, newest first: the expenses linked to it, and the ones under
 * the subscriptions category with its name.
 */
export function chargesOf(sub: Doc, money: Doc[]): Doc[] {
  const key = nameKey(text(sub.data._title));
  return money
    .filter(
      (m) =>
        live(m) &&
        m.data.direction === "expense" &&
        (m.data.payment === sub.id ||
          (m.data.category === SUBSCRIPTION_CATEGORY && nameKey(text(m.data._title)) === key)),
    )
    .sort((a, b) => text(b.data.date).localeCompare(text(a.data.date)));
}

export interface Candidate {
  key: string;
  /** The newest charge: its title, amount, account and date start the form. */
  last: Doc;
  count: number;
  total: number;
}

/**
 * Names charged under the subscriptions category that no subscription covers yet (by name or
 * by link), newest charge first.
 */
export function candidatesOf(money: Doc[], subs: Doc[]): Candidate[] {
  const covered = new Set(subs.map((s) => nameKey(text(s.data._title))));
  const linked = new Set(subs.map((s) => s.id));
  const groups = new Map<string, Doc[]>();
  for (const m of money) {
    if (!live(m) || m.data.direction !== "expense" || m.data.category !== SUBSCRIPTION_CATEGORY)
      continue;
    const key = nameKey(text(m.data._title));
    if (!key || covered.has(key) || linked.has(text(m.data.payment))) continue;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()]
    .map(([key, docs]) => {
      const sorted = docs.sort((a, b) => text(b.data.date).localeCompare(text(a.data.date)));
      return {
        key,
        last: sorted[0] as Doc,
        count: docs.length,
        total: docs.reduce((sum, d) => sum + amountOf(d), 0),
      };
    })
    .sort((a, b) => text(b.last.data.date).localeCompare(text(a.last.data.date)));
}

/**
 * The first monthly date after `today` on the day of a past charge (`YYYY-MM-DD[THH:mm]`), the
 * day clamped in shorter months; the time is kept, 09:00 when the charge had none. Only a
 * suggestion: the owner confirms it in the form.
 */
export function nextMonthlyAfter(charged: string, today: string): string {
  const day = Number(charged.slice(8, 10));
  const time = /T(\d{2}:\d{2})/.exec(charged)?.[1] ?? "09:00";
  let month = charged.slice(0, 7);
  let date = charged.slice(0, 10);
  while (date <= today) {
    month = shiftMonth(month, 1);
    date = `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;
  }
  return `${date}T${time}`;
}
