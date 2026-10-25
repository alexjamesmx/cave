import { expect, test } from "bun:test";
import { CATEGORY_SET, transferCategories } from "./categories.ts";
import { monthSummary } from "./money.ts";
import {
  filterEntries,
  filterFromSearch,
  filterToSearch,
  lastTwelve,
  type MoneyFilter,
  periodSummary,
  previousPeriod,
  topTitles,
} from "./money-stats.ts";
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

test("twelve months end with the asked month, with the savings rate and one category", () => {
  const points = lastTwelve(docs, "2026-11", "2026-12-31", TRANSFERS, "food");
  expect(points.map((p) => p.month)).toEqual([
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
  const oct = points.at(-2);
  expect(oct).toMatchObject({ spent: 1040, income: 20000, category: 100 });
  expect(oct?.savingsRate).toBeCloseTo((20000 - 1040) / 20000);
  expect(points[0]?.savingsRate).toBeUndefined();
});

test("filters combine, and survive a trip through the URL", () => {
  const f: MoneyFilter = {
    from: "2026-10-01",
    to: "2026-10-31",
    direction: "expense",
    categories: ["food", "health"],
    text: "taco",
    min: 50,
    max: 500,
  };
  expect(filterEntries(docs, f).map((d) => d.data.amount)).toEqual([100]);
  expect(filterEntries(docs, { uncategorized: true }).map((d) => d.data.amount)).toEqual([40, 70]);
  expect(filterEntries(docs, { account: "Nu" })).toHaveLength(1);
  expect(filterEntries(docs, {})).toHaveLength(docs.length);
  for (const filter of [f, { uncategorized: true, account: "Nu" }, {}])
    expect(filterFromSearch(filterToSearch(filter))).toEqual(filter);
  expect(filterFromSearch("?from=nope&min=abc&direction=sideways")).toEqual({});
});

test("top titles", () => {
  const oct = periodSummary(docs, { kind: "month", key: "2026-10" }, "2026-12-31", TRANSFERS);
  expect(topTitles(oct.expenses).map((t) => [t.title, t.amount])).toEqual([
    ["City Gym", 900],
    ["Tacos", 100],
    ["Mystery", 40],
  ]);
});
