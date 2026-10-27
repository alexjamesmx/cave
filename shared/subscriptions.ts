import { anchorOf, dueInstant, nextDue, repeatOf, type Zone } from "./recurrence.ts";
import type { Doc } from "./types.ts";

/**
 * Subscriptions: payments of kind `subscription`, read for Money → Subscriptions. Two kinds of
 * number, kept apart: the plan (what the active ones cost a month and a year, from their
 * amount and repeat) and the history (what was really paid: the expenses that belong to one).
 * A month a subscription was paused has no charge, so it never counts.
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

/** Every live subscription, A to Z. */
export const subscriptionsOf = (payments: Doc[]) =>
  payments
    .filter((d) => live(d) && d.data.kind === "subscription")
    .sort((a, b) => text(a.data._title).localeCompare(text(b.data._title)));

/** The active ones' cost a month, and whether any amount only estimates. */
export function monthlyTotal(active: Doc[]): { total: number; approx: boolean } {
  return {
    total: active.reduce((sum, s) => sum + monthlyCost(s), 0),
    approx: active.some((s) => s.data.approx === true),
  };
}

/**
 * The next charge on or after `now`, from the stored date and its repeat, so it moves on by
 * itself; a one-off date stays as it is, even once past. Nothing is written.
 */
export function nextCharge(sub: Doc, now: number, zone: Zone): string | undefined {
  const due = text(sub.data.due);
  if (!due) return undefined;
  const repeat = repeatOf(sub.data);
  const at = dueInstant(due, zone);
  if (repeat === "none" || at === undefined || at >= now) return due;
  return nextDue(anchorOf(sub) ?? due, repeat, now - 1, zone);
}

/**
 * A subscription's real charges, newest first: the expenses linked to it, and the ones under
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

/** What was really paid and since when: the first charge's day, if any. */
export function historyOf(charges: Doc[]): { spent: number; since: string | undefined } {
  const first = charges.at(-1);
  return {
    spent: charges.reduce((sum, c) => sum + amountOf(c), 0),
    since: first ? text(first.data.date).slice(0, 10) || undefined : undefined,
  };
}
