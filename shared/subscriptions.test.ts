import { expect, test } from "bun:test";
import { isActive } from "./payments.ts";
import type { Zone } from "./recurrence.ts";
import {
  chargesOf,
  historyOf,
  monthlyCost,
  monthlyTotal,
  nameKey,
  nextCharge,
  subscriptionsOf,
} from "./subscriptions.ts";
import type { Doc } from "./types.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
// 2026-10-27 12:00 in Mexico City.
const NOW = Date.parse("2026-10-27T18:00:00Z");

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

const music = sub("music", { _title: "Music", amount: 100, due: "2026-08-03" });
const cloud = sub("cloud", { _title: "Cloud", amount: 1200, repeat: "yearly", approx: true });
const gym = sub("gym", { _title: "Gym", amount: 50, active: false });

test("subscriptions are the live payments of that kind, A to Z; active or not", () => {
  const all = subscriptionsOf([
    music,
    cloud,
    gym,
    doc("card", "payments", { kind: "card", _title: "Card" }),
    sub("gone", { _title: "Gone", _deleted: true }),
  ]);
  expect(all.map((d) => d.id)).toEqual(["cloud", "gym", "music"]);
  expect(all.filter(isActive).map((d) => d.id)).toEqual(["cloud", "music"]);
});

test("the plan: a month's cost follows the repeat; the total says when an amount estimates", () => {
  expect(monthlyCost(music)).toBe(100);
  expect(monthlyCost(cloud)).toBe(100);
  expect(monthlyCost(sub("w", { amount: 12, repeat: "weekly" }))).toBe(52);
  expect(monthlyCost(sub("once", { amount: 70, repeat: "none" }))).toBe(0);
  expect(monthlyTotal([music, cloud])).toEqual({ total: 200, approx: true });
  expect(monthlyTotal([])).toEqual({ total: 0, approx: false });
});

test("the next charge moves on by itself from the stored date; a one-off stays put", () => {
  expect(nextCharge(music, NOW, MX)).toBe("2026-11-03");
  expect(nextCharge(sub("soon", { due: "2026-10-30T10:00" }), NOW, MX)).toBe("2026-10-30T10:00");
  expect(nextCharge(sub("today", { due: "2026-09-27T13:00" }), NOW, MX)).toBe("2026-10-27T13:00");
  expect(nextCharge(sub("once", { due: "2026-01-01", repeat: "none" }), NOW, MX)).toBe(
    "2026-01-01",
  );
  expect(nextCharge(cloud, NOW, MX)).toBeUndefined();
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
  charge("r1", { _title: "Music", amount: 20, direction: "income", date: "2026-09-01" }),
];

test("the history: linked charges and its name under the category, what was spent and since when", () => {
  const charges = chargesOf(music, money);
  expect(charges.map((d) => d.id)).toEqual(["m2", "m1", "m3"]);
  expect(historyOf(charges)).toEqual({ spent: 495, since: "2026-07-03" });
  expect(historyOf([])).toEqual({ spent: 0, since: undefined });
  expect(nameKey("  Eleven   Labs ")).toBe("eleven labs");
});
