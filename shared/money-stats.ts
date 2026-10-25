import { dayOf, monthOf, shiftMonth } from "./dates.ts";
import { type MoneyEntry, type MonthSummary, monthSummary } from "./money.ts";
import type { Doc } from "./types.ts";

/** A title for matching: accents and case dropped, spaces collapsed. */
export const normTitle = (s: unknown) =>
  typeof s === "string"
    ? s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";

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
  transferred: number;
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
      transferred: s.transferred,
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

export const currentPeriod = (kind: "month" | "year", today: string) =>
  kind === "month" ? monthOf(today) : today.slice(0, 4);

export interface StackedMonths {
  /** The categories with a column each, biggest over the 12 months first; `null` is untagged. */
  categories: (string | null)[];
  /** Whether a last "other" value follows the categories in each month's `values`. */
  other: boolean;
  months: { month: string; values: number[]; total: number }[];
}

/**
 * Spending per month for the 12 months ending with `endMonth`, split into the `top` biggest
 * categories of those months plus everything else, for one stacked bar per month.
 */
export function stackedTwelve(
  docs: Doc[],
  endMonth: string,
  today: string,
  transfers: ReadonlySet<string>,
  top = 5,
): StackedMonths {
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(endMonth, i - 11)).map((month) =>
    monthSummary(docs, month, today, transfers),
  );
  const totals = new Map<string | null, number>();
  for (const m of months)
    for (const c of m.byCategory) totals.set(c.category, (totals.get(c.category) ?? 0) + c.amount);
  const ranked = [...totals].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const categories = ranked.slice(0, top);
  const other = ranked.length > top;
  return {
    categories,
    other,
    months: months.map((m) => {
      const values = categories.map((c) => m.byCategory.find((x) => x.category === c)?.amount ?? 0);
      const rest = m.spent - values.reduce((t, v) => t + v, 0);
      return { month: m.month, values: other ? [...values, rest] : values, total: m.spent };
    }),
  };
}

/** The change from `before` to `now` as the tiles say it: "+12%", "−8%", "new" or "same". */
export function changeText(now: number, before: number): string {
  if (before === 0) return now === 0 ? "same" : "new";
  const pct = Math.round((Math.abs(now - before) / before) * 100);
  return pct === 0 ? "same" : `${now > before ? "+" : "−"}${pct}%`;
}
