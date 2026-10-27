import { expect, test } from "bun:test";
import {
  candidatesOf,
  chargesOf,
  monthlyCost,
  monthlyTotal,
  nameKey,
  nextMonthlyAfter,
  subscriptionsOf,
} from "./subscriptions.ts";
import type { Doc } from "./types.ts";

const doc = (id: string, collection: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection,
  data,
  stamps: {},
  actor: "seed",
});
const sub = (id: string, data: Record<string, unknown>) =>
  doc(id, "payments", { kind: "subscription", repeat: "monthly", ...data });
const charge = (id: string, data: Record<string, unknown>) =>
  doc(id, "money", { direction: "expense", category: "subscriptions", ...data });

const music = sub("music", { _title: "Music", amount: 100 });
const cloud = sub("cloud", { _title: "Cloud", amount: 1200, repeat: "yearly", approx: true });
const gym = sub("gym", { _title: "Gym", amount: 50, active: false });
const payments = [
  music,
  cloud,
  gym,
  doc("card", "payments", { kind: "card", _title: "Card", amount: 900 }),
  sub("gone", { _title: "Gone", _deleted: true }),
];

test("subscriptions are the live payments of that kind, active and cancelled apart", () => {
  const { active, cancelled } = subscriptionsOf(payments);
  expect(active.map((d) => d.id)).toEqual(["cloud", "music"]);
  expect(cancelled.map((d) => d.id)).toEqual(["gym"]);
});

test("a month's cost follows the repeat; the total says when an amount only estimates", () => {
  expect(monthlyCost(music)).toBe(100);
  expect(monthlyCost(cloud)).toBe(100);
  expect(monthlyCost(sub("w", { amount: 12, repeat: "weekly" }))).toBe(52);
  expect(monthlyCost(sub("once", { amount: 70, repeat: "none" }))).toBe(0);
  expect(monthlyTotal([music, cloud])).toEqual({ total: 200, approx: true });
  expect(monthlyTotal([])).toEqual({ total: 0, approx: false });
});

const money = [
  charge("m1", { _title: "music", amount: 100, date: "2026-08-03T10:00" }),
  charge("m2", { _title: "Music ", amount: 95, date: "2026-09-03T10:00" }),
  doc("m3", "money", {
    direction: "expense",
    _title: "Weekly shop",
    amount: 300,
    payment: "music",
    date: "2026-07-03",
  }),
  charge("m4", { _title: "Music", amount: 100, date: "2026-10-03", _deleted: true }),
  charge("v1", { _title: "Video", amount: 169, date: "2026-05-16T13:54" }),
  charge("v2", { _title: "video", amount: 169, date: "2026-03-16T19:10" }),
  charge("a1", { _title: "AI", amount: 339, date: "2026-08-20T18:47" }),
  charge("r1", { _title: "Refund", amount: 20, direction: "income", date: "2026-09-01" }),
];

test("a subscription's charges: linked ones and its name under the category, newest first", () => {
  expect(chargesOf(music, money).map((d) => d.id)).toEqual(["m2", "m1", "m3"]);
  expect(nameKey("  Eleven   Labs ")).toBe("eleven labs");
});

test("names charged as subscriptions with no subscription yet, newest charge first", () => {
  const found = candidatesOf(money, [music, cloud]);
  expect(found.map((c) => [c.key, c.last.id, c.count, c.total])).toEqual([
    ["ai", "a1", 1, 339],
    ["video", "v1", 2, 338],
  ]);
  // Once set up, a name stops showing.
  expect(candidatesOf(money, [music, sub("video", { _title: "Video" })]).map((c) => c.key)).toEqual(
    ["ai"],
  );
});

test("the suggested next charge: the same day each month after today, clamped, time kept", () => {
  expect(nextMonthlyAfter("2026-08-20T18:47", "2026-10-27")).toBe("2026-11-20T18:47");
  expect(nextMonthlyAfter("2026-10-30", "2026-10-27")).toBe("2026-10-30T09:00");
  expect(nextMonthlyAfter("2026-01-31T08:00", "2026-02-10")).toBe("2026-02-28T08:00");
  expect(nextMonthlyAfter("2026-10-27T08:00", "2026-10-27")).toBe("2026-11-27T08:00");
});
