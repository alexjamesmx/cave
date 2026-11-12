import { expect, test } from "bun:test";
import type { SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { byUse, lastAccount, parseAmount, saveLabel } from "./money-form.ts";

const opt = (value: string, archived = false): SelectOption => ({
  value,
  icon: "landmark",
  color: "#000",
  ...(archived ? { archived: true } : {}),
});
let n = 0;
const doc = (data: Record<string, unknown>): Doc => ({
  id: `m${++n}`,
  kind: "item",
  collection: "money",
  data,
  stamps: {},
  actor: "",
});

test("the newest entry's account is preselected, never an archived one; else the first live one", () => {
  const all = [opt("card"), opt("cash"), opt("old", true)];
  const offered = all.filter((o) => o.archived !== true);
  const items = [
    doc({ account: "card", _created: "2026-10-01T10:00:00.000Z" }),
    doc({ account: "cash", _created: "2026-10-03T10:00:00.000Z" }),
    doc({ account: "old", _created: "2026-10-09T10:00:00.000Z" }),
    doc({ account: "card", _created: "2026-10-12T10:00:00.000Z", _deleted: true }),
  ];
  expect(lastAccount(items, offered)).toBe("cash");
  expect(lastAccount([doc({ account: "old", _created: "2026-10-09" })], offered)).toBe("card");
  expect(lastAccount([], offered)).toBe("card");
  expect(lastAccount(items, [])).toBeUndefined();
});

test("categories by use, ties in their stored order", () => {
  const options = [opt("food"), opt("home"), opt("fun"), opt("travel")];
  const items = [
    doc({ category: "fun" }),
    doc({ category: "home" }),
    doc({ category: "fun" }),
    doc({ category: "other" }),
  ];
  expect(byUse(items, options).map((o) => o.value)).toEqual(["fun", "home", "food", "travel"]);
});

test("amounts: $ and commas allowed, nothing at or below zero, nothing that isn't a number", () => {
  expect(parseAmount("245")).toBe(245);
  expect(parseAmount("$1,225.50")).toBe(1225.5);
  expect(parseAmount(" 12. ")).toBe(12);
  expect(parseAmount(".5")).toBe(0.5);
  expect(parseAmount("0")).toBeUndefined();
  expect(parseAmount("")).toBeUndefined();
  expect(parseAmount("12a")).toBeUndefined();
  expect(parseAmount("-3")).toBeUndefined();
});

test("the save button names the sign, the amount and the category", () => {
  expect(saveLabel("expense", 245, "Food")).toBe("Save −$245 · Food");
  expect(saveLabel("income", 38000, undefined)).toBe("Save +$38,000");
  expect(saveLabel("expense", undefined, "Food")).toBe("Save");
});
