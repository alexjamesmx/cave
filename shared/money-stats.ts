import { monthOf, shiftMonth } from "./dates.ts";
import { type MoneyEntry, type MonthSummary, monthSummary } from "./money.ts";
import type { Doc } from "./types.ts";

/** A title for matching: accents and case dropped, spaces collapsed. */
export const normTitle = (s: unknown) =>
  typeof s === "string"
    ? s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";

/**
 * Money dashboards beyond one month (M7b part 7): years and the twelve-month bars. Every period
 * total is built from `monthSummary`, the function `money_month` uses, so they always agree.
 */

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
