import { dayOf, monthOf, shiftMonth } from "./dates.ts";
import { type MoneyEntry, type MonthSummary, monthSummary } from "./money.ts";
import { normTitle } from "./subscription-finder.ts";
import type { Doc } from "./types.ts";

/**
 * Money dashboards beyond one month (M7b part 7): filters, years, trends. Every period total
 * is built from `monthSummary`, the function `money_month` uses, so they always agree.
 */

export interface MoneyFilter {
  /** Local days, inclusive. */
  from?: string;
  to?: string;
  direction?: "expense" | "income";
  categories?: string[];
  account?: string;
  text?: string;
  min?: number;
  max?: number;
  uncategorized?: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The entries a filter keeps; one with no filter keeps everything. */
export function filterEntries(docs: readonly Doc[], f: MoneyFilter): Doc[] {
  const text = f.text ? normTitle(f.text) : "";
  return docs.filter((d) => {
    const day = dayOf(d.data.date);
    if ((f.from || f.to) && !day) return false;
    if (f.from && day && day < f.from) return false;
    if (f.to && day && day > f.to) return false;
    if (f.direction && d.data.direction !== f.direction) return false;
    const category = str(d.data.category);
    if (f.uncategorized && category) return false;
    if (f.categories?.length && !f.categories.includes(category)) return false;
    if (f.account && str(d.data.account) !== f.account) return false;
    const amount = d.data.amount;
    if (f.min !== undefined && !(typeof amount === "number" && amount >= f.min)) return false;
    if (f.max !== undefined && !(typeof amount === "number" && amount <= f.max)) return false;
    if (text && !normTitle(`${str(d.data._title)} ${str(d.data.detail)}`).includes(text))
      return false;
    return true;
  });
}

const KEYS = ["from", "to", "direction", "account", "text", "min", "max"] as const;

/** The filter as URL query parameters, so a view can be bookmarked. */
export function filterToSearch(f: MoneyFilter): string {
  const p = new URLSearchParams();
  for (const k of KEYS) if (f[k] !== undefined && f[k] !== "") p.set(k, String(f[k]));
  if (f.categories?.length) p.set("categories", f.categories.join(","));
  if (f.uncategorized) p.set("uncategorized", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function filterFromSearch(search: string): MoneyFilter {
  const p = new URLSearchParams(search);
  const f: MoneyFilter = {};
  const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const num = (v: string | null) =>
    v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
  const from = day(p.get("from"));
  const to = day(p.get("to"));
  if (from) f.from = from;
  if (to) f.to = to;
  const direction = p.get("direction");
  if (direction === "expense" || direction === "income") f.direction = direction;
  const categories = p.get("categories")?.split(",").filter(Boolean);
  if (categories?.length) f.categories = categories;
  const account = p.get("account");
  if (account) f.account = account;
  const text = p.get("text");
  if (text) f.text = text;
  const min = num(p.get("min"));
  const max = num(p.get("max"));
  if (min !== undefined) f.min = min;
  if (max !== undefined) f.max = max;
  if (p.get("uncategorized") === "1") f.uncategorized = true;
  return f;
}

const monthsOf = (year: string) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

export interface PeriodSummary {
  income: number;
  spent: number;
  net: number;
  transferred: number;
  incomeCount: number;
  spentCount: number;
  incomplete: number;
  byCategory: { category: string | null; amount: number }[];
  expenses: MoneyEntry[];
  /** One row per month of the period. */
  months: MonthSummary[];
}

/** A month or a year, summed from its months' `monthSummary`. */
export function periodSummary(
  docs: Doc[],
  period: { kind: "month" | "year"; key: string },
  today: string,
  transfers: ReadonlySet<string>,
): PeriodSummary {
  const keys = period.kind === "month" ? [period.key] : monthsOf(period.key);
  const months = keys.map((m) => monthSummary(docs, m, today, transfers));
  const categories = new Map<string | null, number>();
  for (const m of months)
    for (const c of m.byCategory)
      categories.set(c.category, (categories.get(c.category) ?? 0) + c.amount);
  const sum = (pick: (m: MonthSummary) => number) => months.reduce((t, m) => t + pick(m), 0);
  return {
    income: sum((m) => m.income),
    spent: sum((m) => m.spent),
    net: sum((m) => m.net),
    transferred: sum((m) => m.transferred),
    incomeCount: sum((m) => m.incomeCount),
    spentCount: sum((m) => m.spentCount),
    incomplete: sum((m) => m.incomplete.length),
    byCategory: [...categories]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    expenses: months.flatMap((m) => m.expenses).sort((a, b) => b.amount - a.amount),
    months,
  };
}

/** The period before: last month, or last year. */
export const previousPeriod = (p: { kind: "month" | "year"; key: string }) =>
  p.kind === "month"
    ? { ...p, key: shiftMonth(p.key, -1) }
    : { ...p, key: String(Number(p.key) - 1) };

interface TrendPoint {
  month: string;
  spent: number;
  income: number;
  /** (income − spent) / income; `undefined` without income. */
  savingsRate: number | undefined;
  /** Spending in one category, when one is asked for. */
  category: number;
}

/** The 12 months ending with `endMonth`. */
export function lastTwelve(
  docs: Doc[],
  endMonth: string,
  today: string,
  transfers: ReadonlySet<string>,
  category?: string | null,
): TrendPoint[] {
  return Array.from({ length: 12 }, (_, i) => shiftMonth(endMonth, i - 11)).map((month) => {
    const s = monthSummary(docs, month, today, transfers);
    return {
      month,
      spent: s.spent,
      income: s.income,
      savingsRate: s.income > 0 ? (s.income - s.spent) / s.income : undefined,
      category:
        category === undefined
          ? 0
          : (s.byCategory.find((c) => c.category === category)?.amount ?? 0),
    };
  });
}

/** Spending by title for the period, largest first. */
export function topTitles(
  expenses: MoneyEntry[],
  n = 8,
): { title: string; amount: number; count: number }[] {
  const byTitle = new Map<string, { title: string; amount: number; count: number }>();
  for (const e of expenses) {
    const title = str(e.doc.data._title) || "Untitled";
    const key = normTitle(title);
    const row = byTitle.get(key) ?? { title, amount: 0, count: 0 };
    row.amount += e.amount;
    row.count += 1;
    byTitle.set(key, row);
  }
  return [...byTitle.values()].sort((a, b) => b.amount - a.amount).slice(0, n);
}

/**
 * Fixed spending is what a payment covers (its title matches a payment's) or a subscription;
 * everything else is variable.
 */
export function fixedVsVariable(expenses: MoneyEntry[], payments: readonly Doc[]) {
  const titles = new Set(
    payments.filter((p) => p.data._deleted !== true).map((p) => normTitle(p.data._title)),
  );
  let fixed = 0;
  let variable = 0;
  for (const e of expenses) {
    const isFixed = titles.has(normTitle(e.doc.data._title)) || e.category === "subscriptions";
    if (isFixed) fixed += e.amount;
    else variable += e.amount;
  }
  return { fixed, variable };
}

export const currentPeriod = (kind: "month" | "year", today: string) =>
  kind === "month" ? monthOf(today) : today.slice(0, 4);
