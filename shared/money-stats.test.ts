import { expect, test } from "bun:test";
import { CATEGORY_SET, transferCategories } from "./categories.ts";
import { monthSummary } from "./money.ts";
import { periodSummary, previousPeriod, stackedTwelve } from "./money-stats.ts";
import type { Doc } from "./types.ts";

const TRANSFERS = transferCategories({
  id: "category",
  name: "Category",
  type: "select",
  options: CATEGORY_SET,
});
let n = 0;
const entry = (date: string, amount: number, data: Record<string, unknown> = {}): Doc => ({
  id: `e${n++}`,
  kind: "item",
  collection: "money",
  data: { _title: "x", date, amount, direction: "expense", ...data },
  stamps: {},
  actor: "test",
});

const docs = [
  // The last minute of October, local time, is October's.
  entry("2026-10-31T23:59", 100, { _title: "Tacos", category: "food", account: "Nu" }),
  entry("2026-11-01T00:00", 50, { _title: "Tacos", category: "food" }),
  entry("2026-10-05T10:00", 900, { _title: "City Gym", category: "health" }),
  entry("2026-10-06T10:00", 5000, { category: "investment" }),
  entry("2026-10-07T10:00", 40, { _title: "Mystery" }),
  entry("2026-10-15T10:00", 20000, { _title: "Salary", direction: "income", category: "salary" }),
  entry("2026-03-01T10:00", 300, { _title: "Trip", category: "travel" }),
  entry("2026-05-01T10:00", 70),
];

test("a year is the sum of its months, each exactly as money_month counts it", () => {
  const year = periodSummary(docs, { kind: "year", key: "2026" }, "2026-12-31", TRANSFERS);
  for (const m of year.months) {
    const alone = monthSummary(docs, m.month, "2026-12-31", TRANSFERS);
    expect([m.spent, m.income, m.transferred]).toEqual([
      alone.spent,
      alone.income,
      alone.transferred,
    ]);
  }
  // Transfers are out of spending; uncategorized entries are counted, as `null`.
  expect(year.spent).toBe(100 + 50 + 900 + 40 + 300 + 70);
  expect(year.transferred).toBe(5000);
  expect(year.byCategory.find((c) => c.category === null)?.amount).toBe(110);
  const oct = periodSummary(docs, { kind: "month", key: "2026-10" }, "2026-12-31", TRANSFERS);
  expect(oct.spent).toBe(1040);
  expect(oct.income).toBe(20000);
  expect(previousPeriod({ kind: "month", key: "2026-01" })).toEqual({
    kind: "month",
    key: "2025-12",
  });
  expect(previousPeriod({ kind: "year", key: "2026" })).toEqual({ kind: "year", key: "2025" });
});

test("twelve stacked months end with the asked month: the biggest categories, then the rest", () => {
  const s = stackedTwelve(docs, "2026-11", "2026-12-31", TRANSFERS, 2);
  expect(s.months.map((m) => m.month)).toEqual([
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ]);
  expect(s.categories).toEqual(["health", "travel"]);
  expect(s.other).toBe(true);
  expect(s.months.at(-2)).toEqual({ month: "2026-10", values: [900, 0, 140], total: 1040 });
});
