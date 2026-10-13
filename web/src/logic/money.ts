import type { Doc } from "../../../shared/types.ts";
import { dayOf, daysInMonth, monthOf } from "./dates.ts";

export interface MoneyEntry {
  doc: Doc;
  day: string;
  amount: number;
  direction: "income" | "expense";
  category: string | null;
}

export interface MonthSummary {
  month: string;
  income: number;
  spent: number;
  net: number;
  incomeCount: number;
  spentCount: number;
  /** Spent per elapsed day; undefined for a month that hasn't started. */
  burnPerDay: number | undefined;
  daysElapsed: number;
  /** Spent per day of the month, index 0 is the 1st. */
  byDay: number[];
  /** Spending by category, largest first; `null` is untagged. */
  byCategory: { category: string | null; amount: number }[];
  expenses: MoneyEntry[];
  incomes: MoneyEntry[];
  /** Dated in this month but missing an amount or direction: shown, never summed by guess. */
  incomplete: Doc[];
}

function toEntry(doc: Doc): MoneyEntry | Doc {
  const { amount, direction, category } = doc.data;
  const day = dayOf(doc.data.date) as string;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return doc;
  if (direction !== "income" && direction !== "expense") return doc;
  return { doc, day, amount, direction, category: typeof category === "string" ? category : null };
}

const isEntry = (x: MoneyEntry | Doc): x is MoneyEntry => "day" in x;

/** Ledger docs without a usable date, which no month can include. */
export const undatedEntries = (docs: Doc[]) => docs.filter((d) => dayOf(d.data.date) === undefined);

export function monthSummary(docs: Doc[], month: string, today: string): MonthSummary {
  const inMonth = docs.filter((d) => {
    const day = dayOf(d.data.date);
    return day !== undefined && monthOf(day) === month;
  });
  const mapped = inMonth.map(toEntry);
  const entries = mapped.filter(isEntry);
  const incomplete = mapped.filter((x): x is Doc => !isEntry(x));
  const expenses = entries.filter((e) => e.direction === "expense");
  const incomes = entries.filter((e) => e.direction === "income");
  const sum = (list: MoneyEntry[]) => list.reduce((total, e) => total + e.amount, 0);

  const length = daysInMonth(month);
  const byDay: number[] = Array.from({ length }, () => 0);
  for (const e of expenses) {
    const i = Number(e.day.slice(8, 10)) - 1;
    byDay[i] = (byDay[i] ?? 0) + e.amount;
  }

  const categories = new Map<string | null, number>();
  for (const e of expenses)
    categories.set(e.category, (categories.get(e.category) ?? 0) + e.amount);

  const thisMonth = monthOf(today);
  const daysElapsed =
    month < thisMonth ? length : month === thisMonth ? Number(today.slice(8, 10)) : 0;
  const spent = sum(expenses);
  const income = sum(incomes);
  const byAmount = (a: MoneyEntry, b: MoneyEntry) => b.amount - a.amount;

  return {
    month,
    income,
    spent,
    net: income - spent,
    incomeCount: incomes.length,
    spentCount: expenses.length,
    burnPerDay: daysElapsed > 0 ? spent / daysElapsed : undefined,
    daysElapsed,
    byDay,
    byCategory: [...categories]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    expenses: expenses.sort(byAmount),
    incomes: incomes.sort(byAmount),
    incomplete,
  };
}
