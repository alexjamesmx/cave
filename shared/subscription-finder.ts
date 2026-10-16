import { dayOf } from "./dates.ts";
import type { Doc } from "./types.ts";

/**
 * Finds what looks like a subscription in the money history: the same title, amounts within
 * ±15% of their median, at monthly or yearly spacing. It only proposes; the owner confirms
 * each one before a payment exists.
 */

export interface SubscriptionCandidate {
  key: string;
  title: string;
  /** The latest amount. */
  amount: number;
  category: string | null;
  account: string | null;
  repeat: "monthly" | "yearly";
  count: number;
  lastDay: string;
  /** One period after the last payment. */
  nextDue: string;
}

const TOLERANCE = 0.15;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHLY = { min: 25, max: 35, at: 3 } as const;
const YEARLY = { min: 350, max: 380, at: 2 } as const;

export const normTitle = (s: unknown) =>
  typeof s === "string"
    ? s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

function addPeriod(day: string, repeat: "monthly" | "yearly"): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const months = repeat === "monthly" ? 1 : 12;
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function findSubscriptions(
  money: readonly Doc[],
  payments: readonly Doc[],
): SubscriptionCandidate[] {
  const known = new Set(
    payments.filter((p) => p.data._deleted !== true).map((p) => normTitle(p.data._title)),
  );
  const groups = new Map<string, { doc: Doc; day: string; amount: number }[]>();
  for (const doc of money) {
    if (doc.data._deleted === true || doc.data.direction !== "expense") continue;
    const key = normTitle(doc.data._title);
    const day = dayOf(doc.data.date);
    const amount = doc.data.amount;
    if (!key || !day || typeof amount !== "number" || amount <= 0 || known.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), { doc, day, amount }]);
  }

  const found: SubscriptionCandidate[] = [];
  for (const [key, all] of groups) {
    const mid = median(all.map((e) => e.amount));
    const near = all
      .filter((e) => Math.abs(e.amount - mid) <= mid * TOLERANCE)
      .sort((a, b) => a.day.localeCompare(b.day));
    const gaps = near.slice(1).map((e, i) => daysBetween((near[i] as { day: string }).day, e.day));
    const spaced = (p: { min: number; max: number; at: number }) =>
      near.length >= p.at && gaps.every((g) => g >= p.min && g <= p.max);
    const repeat = spaced(MONTHLY) ? "monthly" : spaced(YEARLY) ? "yearly" : undefined;
    if (!repeat) continue;
    const last = near.at(-1) as { doc: Doc; day: string; amount: number };
    const text = (v: unknown) => (typeof v === "string" && v ? v : null);
    found.push({
      key,
      title: text(last.doc.data._title) ?? key,
      amount: last.amount,
      category: text(last.doc.data.category),
      account: text(last.doc.data.account),
      repeat,
      count: near.length,
      lastDay: last.day,
      nextDue: addPeriod(last.day, repeat),
    });
  }
  return found.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}
