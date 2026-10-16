import { expect, test } from "bun:test";
import { findSubscriptions } from "./subscription-finder.ts";
import type { Doc } from "./types.ts";

let n = 0;
const spend = (
  title: string,
  date: string,
  amount: number,
  extra: Record<string, unknown> = {},
): Doc => ({
  id: `m${n++}`,
  kind: "item",
  collection: "money",
  data: { _title: title, date, amount, direction: "expense", ...extra },
  stamps: {},
  actor: "test",
});

test("monthly and yearly repeats with similar amounts are proposed, with their next date", () => {
  const money = [
    spend("City Gym", "2026-07-03T08:00", 699, { category: "health", account: "Nu" }),
    spend("City Gym", "2026-08-03T08:00", 699),
    spend("City Gym", "2026-09-04T08:00", 749, { category: "health", account: "Nu" }),
    spend("Claude", "2025-10-20", 3800),
    spend("Claude", "2026-10-20", 4000, { category: "subscriptions" }),
  ];
  expect(findSubscriptions(money, [])).toEqual([
    {
      key: "smart fit",
      title: "City Gym",
      amount: 749,
      category: "health",
      account: "Nu",
      repeat: "monthly",
      count: 3,
      lastDay: "2026-09-04",
      nextDue: "2026-10-04",
    },
    expect.objectContaining({ key: "claude", repeat: "yearly", count: 2, nextDue: "2027-10-20" }),
  ]);
});

test("different amounts, irregular dates, too few, income and known payments are left out", () => {
  const money = [
    // ±15%: 300 is too far from 100's median band.
    spend("Uber", "2026-07-01", 100),
    spend("Uber", "2026-08-01", 300),
    spend("Uber", "2026-09-01", 900),
    // Irregular spacing.
    spend("Oxxo", "2026-07-01", 50),
    spend("Oxxo", "2026-07-09", 50),
    spend("Oxxo", "2026-08-30", 50),
    // Only two monthly ones.
    spend("Spotify", "2026-08-10", 129),
    spend("Spotify", "2026-09-10", 129),
    {
      ...spend("Salary", "2026-08-15", 20000),
      data: { _title: "Salary", date: "2026-08-15", amount: 20000, direction: "income" },
    },
    spend("Apple", "2026-07-12", 49),
    spend("Apple", "2026-08-12", 49),
    spend("Apple", "2026-09-12", 49),
  ];
  const payments: Doc[] = [
    {
      id: "p",
      kind: "item",
      collection: "payments",
      data: { _title: "apple" },
      stamps: {},
      actor: "test",
    },
  ];
  expect(findSubscriptions(money, payments)).toEqual([]);
});
