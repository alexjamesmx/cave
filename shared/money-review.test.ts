import { expect, test } from "bun:test";
import { CATEGORY_SET } from "./categories.ts";
import { buildReview, proposeFor } from "./money-review.ts";
import type { Doc } from "./types.ts";

const entry = (data: Record<string, unknown>, id = "m"): Doc => ({
  id,
  kind: "item",
  collection: "money",
  data: { direction: "expense", amount: 100, date: "2026-10-01T12:00", ...data },
  stamps: {},
  actor: "test",
});
const propose = (data: Record<string, unknown>) => proposeFor(entry(data), CATEGORY_SET);

test("each rule places what it clearly describes", () => {
  expect(propose({ detail: "AI tools", category: "other" })).toMatchObject({ to: "subscriptions" });
  expect(propose({ detail: "Digital service" })).toMatchObject({ from: null, to: "subscriptions" });
  expect(propose({ detail: "Trip", category: "fun" })).toMatchObject({ to: "travel" });
  expect(propose({ detail: "Snacks & treats", category: "food" })).toMatchObject({ to: "gula" });
  expect(propose({ _title: "Gula" })).toMatchObject({ to: "gula" });
  expect(propose({ detail: "Gym", category: "other" })).toMatchObject({ to: "health" });
  expect(propose({ _title: "Despensa semanal", category: "food" })).toMatchObject({
    to: "groceries",
  });
  expect(propose({ _title: "Super", category: "home" })).toMatchObject({ to: "groceries" });
  const income = { direction: "income" };
  expect(propose({ ...income, detail: "salary", category: "income" })).toMatchObject({
    to: "salary",
  });
  expect(propose({ ...income, _title: "Vales despensa" })).toMatchObject({ to: "vales" });
  expect(propose({ ...income, _title: "Renta depa", category: "income" })).toMatchObject({
    to: "rent_income",
  });
});

test("a title or kind that contradicts the category uncategorizes it; nothing is guessed", () => {
  expect(propose({ _title: "Mezcal", category: "other" })).toMatchObject({ to: null });
  expect(propose({ _title: "tacos al pastor", category: "fun" })).toMatchObject({ to: null });
  expect(propose({ _title: "Scooter", category: "investment" })).toMatchObject({ to: null });
  expect(propose({ _title: "Didi", category: "food" })).toMatchObject({ to: null });
  expect(propose({ _title: "Bonus", category: "food", direction: "income" })).toMatchObject({
    to: null,
    rule: "an expense category on an income entry",
  });
  // A rule that disagrees with a specific category uncategorizes rather than overriding it.
  expect(propose({ detail: "Trip", category: "health" })).toMatchObject({ to: null });
  // What fits stays; an uncategorized entry no rule places stays uncategorized.
  expect(propose({ _title: "tacos", category: "food" })).toBeUndefined();
  expect(propose({ _title: "Mezcal", category: "fun" })).toBeUndefined();
  expect(propose({ _title: "Something" })).toBeUndefined();
  expect(propose({ _title: "Super", category: "groceries" })).toBeUndefined();
});

test("the review covers live money entries only, newest first, with what the page shows", () => {
  const docs = [
    entry({ _title: "Mezcal", category: "other", date: "2026-09-01T20:00" }, "a"),
    entry({ _title: "Gula", date: "2026-10-02T09:00" }, "b"),
    entry({ _title: "Gula", _deleted: true }, "c"),
    { ...entry({ _title: "Gula" }, "d"), collection: "tasks" },
    entry({ _title: "Coffee", category: "food" }, "e"),
  ];
  expect(buildReview(docs, CATEGORY_SET)).toEqual([
    {
      id: "b",
      from: null,
      to: "gula",
      rule: "detail “Snacks & treats” or a title “gula”",
      date: "2026-10-02T09:00",
      title: "Gula",
      amount: 100,
      direction: "expense",
    },
    expect.objectContaining({ id: "a", from: "other", to: null }),
  ]);
});
