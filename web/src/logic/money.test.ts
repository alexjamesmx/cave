import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import { monthSummary, undatedEntries } from "./money.ts";

let n = 0;
const entry = (data: Record<string, unknown>): Doc => ({
  id: `m${n++}`,
  kind: "item",
  collection: "money",
  data,
  stamps: {},
  actor: "import",
});

const ledger = [
  entry({ date: "2026-10-07T10:00", amount: 6024, direction: "expense", category: "home" }),
  entry({ date: "2026-10-01", amount: 710, direction: "expense", category: "food" }),
  entry({ date: "2026-10-01", amount: 617, direction: "expense" }),
  entry({ date: "2026-10-02", amount: 1000, direction: "income", category: "income" }),
  entry({ date: "2026-10-03", direction: "expense", category: "food" }),
  entry({ date: "2026-09-30", amount: 15040, direction: "income" }),
  entry({ amount: 5, direction: "expense" }),
];

test("sums a month's income and spending, every entry included", () => {
  const s = monthSummary(ledger, "2026-10", "2026-10-12");
  expect(s.spent).toBe(7351);
  expect(s.spentCount).toBe(3);
  expect(s.income).toBe(1000);
  expect(s.net).toBe(-6351);
  expect(s.incomplete).toHaveLength(1);
  expect(s.expenses.map((e) => e.amount)).toEqual([6024, 710, 617]);
});

test("burn rate divides by days elapsed; past months use their full length", () => {
  expect(monthSummary(ledger, "2026-10", "2026-10-12").burnPerDay).toBeCloseTo(7351 / 12);
  expect(monthSummary(ledger, "2026-09", "2026-10-12").daysElapsed).toBe(30);
  expect(monthSummary(ledger, "2026-11", "2026-10-12").burnPerDay).toBeUndefined();
});

test("spending per day and per category, untagged as null", () => {
  const s = monthSummary(ledger, "2026-10", "2026-10-12");
  expect(s.byDay).toHaveLength(31);
  expect(s.byDay[0]).toBe(1327);
  expect(s.byDay[6]).toBe(6024);
  expect(s.byCategory).toEqual([
    { category: "home", amount: 6024 },
    { category: "food", amount: 710 },
    { category: null, amount: 617 },
  ]);
});

test("entries without a date are found, so they can be shown", () => {
  expect(undatedEntries(ledger)).toHaveLength(1);
});
