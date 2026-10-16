import { expect, test } from "bun:test";
import {
  CATEGORY_SET,
  categoriesFor,
  mergeCategoryOptions,
  optionText,
  transferCategories,
} from "./categories.ts";
import { monthSummary } from "./money.ts";
import type { Doc } from "./types.ts";

test("categories for a direction: its own kind, transfers and the owner's kindless ones", () => {
  const options = [...CATEGORY_SET, { value: "pets", icon: "dog", color: "#000" }];
  const expense = categoriesFor(options, "expense").map((o) => o.value);
  expect(expense).toContain("gula");
  expect(expense).toContain("investment");
  expect(expense).toContain("pets");
  expect(expense).not.toContain("salary");
  expect(categoriesFor(options, "income").map((o) => o.value)).not.toContain("food");
  expect(optionText({ value: "health", label: "Health & gym", emoji: "💪" })).toBe(
    "💪 Health & gym",
  );
  expect(optionText({ value: "pets" })).toBe("pets");
});

test("merging never removes an option and never overwrites the owner's label", () => {
  const merged = mergeCategoryOptions([
    { value: "food", icon: "utensils", color: "#f00", label: "Comida" },
    { value: "pets", icon: "dog", color: "#000" },
  ]);
  expect(merged[0]).toMatchObject({ value: "food", label: "Comida", emoji: "🍔", kind: "expense" });
  expect(merged[1]).toEqual({ value: "pets", icon: "dog", color: "#000" });
  expect(merged).toHaveLength(CATEGORY_SET.length + 1);
  expect(mergeCategoryOptions(merged)).toEqual(merged);
});

test("transfers count as neither spending nor income, and are reported apart", () => {
  const entry = (id: string, data: Record<string, unknown>): Doc => ({
    id,
    kind: "item",
    collection: "money",
    data: { date: "2026-10-05T10:00", ...data },
    stamps: {},
    actor: "test",
  });
  const field = {
    id: "category",
    name: "Category",
    type: "select" as const,
    options: CATEGORY_SET,
  };
  const s = monthSummary(
    [
      entry("a", { amount: 100, direction: "expense", category: "food" }),
      entry("b", { amount: 5000, direction: "expense", category: "investment" }),
      entry("c", { amount: 20000, direction: "income", category: "salary" }),
    ],
    "2026-10",
    "2026-10-15",
    transferCategories(field),
  );
  expect([s.spent, s.income, s.transferred, s.transfers.length]).toEqual([100, 20000, 5000, 1]);
});
