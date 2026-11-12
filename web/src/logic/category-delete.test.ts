import { expect, test } from "bun:test";
import type { SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { deleteCategoryPlan, holding, restoreOption } from "./category-delete.ts";

const opt = (value: string): SelectOption => ({ value, icon: "tag", color: "#000" });
const options = [opt("food"), opt("treats"), opt("home")];
let n = 0;
const doc = (data: Record<string, unknown>): Doc => ({
  id: `i${++n}`,
  kind: "item",
  collection: "money",
  data,
  stamps: {},
  actor: "",
});

test("a category no entry uses leaves the list with nothing to move, so no dialog is needed", () => {
  const items = [doc({ category: "food" }), doc({ category: "treats", _deleted: true })];
  const plan = deleteCategoryPlan(options, items, "treats");
  expect(plan.options.map((o) => o.value)).toEqual(["food", "home"]);
  expect(plan.patches).toEqual([]);
});

test("its entries move to the chosen category", () => {
  const a = doc({ category: "treats" });
  const b = doc({ category: "treats" });
  const plan = deleteCategoryPlan(options, [a, doc({ category: "food" }), b], "treats", "food");
  expect(plan.patches).toEqual([
    { id: a.id, patch: { category: "food" } },
    { id: b.id, patch: { category: "food" } },
  ]);
});

test("moving to nothing clears the category, so the entries wait in To review", () => {
  const a = doc({ category: "treats" });
  const plan = deleteCategoryPlan(options, [a], "treats");
  expect(plan.patches).toEqual([{ id: a.id, patch: { category: null } }]);
  expect(deleteCategoryPlan(options, [a], "treats", "").patches[0]?.patch).toEqual({
    category: null,
  });
});

test("an account deletes the same way, on its own field", () => {
  const accounts = [opt("card"), opt("cash")];
  const a = doc({ account: "card", category: "card" });
  const plan = deleteCategoryPlan(accounts, [a], "card", "cash", "account");
  expect(plan.options.map((o) => o.value)).toEqual(["cash"]);
  expect(plan.patches).toEqual([{ id: a.id, patch: { account: "cash" } }]);
  expect(holding([a], "card", "account")).toEqual([a]);
});

test("undo puts the option back in its place, keeping later edits to the list", () => {
  const after = deleteCategoryPlan(options, [], "treats").options;
  expect(restoreOption(after, options, "treats").map((o) => o.value)).toEqual([
    "food",
    "treats",
    "home",
  ]);
  const edited = [opt("home"), opt("food"), opt("new")];
  expect(restoreOption(edited, options, "treats").map((o) => o.value)).toEqual([
    "home",
    "food",
    "treats",
    "new",
  ]);
  expect(restoreOption(after, options, "food")).toEqual(after);
  expect(restoreOption(after, [opt("first"), ...options], "first")[0]?.value).toBe("first");
});
