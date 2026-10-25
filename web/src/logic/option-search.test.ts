import { expect, test } from "bun:test";
import type { SelectOption } from "../../../shared/schema.ts";
import { filterOptions } from "./option-search.ts";

const o = (value: string, label?: string, archived?: boolean): SelectOption => ({
  value,
  icon: "tag",
  color: "#000000",
  ...(label ? { label } : {}),
  ...(archived ? { archived: true } : {}),
});

const options = [
  o("food", "Food"),
  o("groceries", "Groceries"),
  o("gula", "Gula"),
  o("cafe", "Café"),
  o("old", "Old", true),
  o("health_gym", "Health & gym"),
];

test("an empty query lists every live option in the stored order", () => {
  expect(filterOptions(options, "").map((x) => x.value)).toEqual([
    "food",
    "groceries",
    "gula",
    "cafe",
    "health_gym",
  ]);
});

test("matches by label or value, accents and case ignored, prefixes first", () => {
  expect(filterOptions(options, "g").map((x) => x.value)).toEqual([
    "groceries",
    "gula",
    "health_gym",
  ]);
  expect(filterOptions(options, "CAFE").map((x) => x.value)).toEqual(["cafe"]);
  expect(filterOptions(options, "gym").map((x) => x.value)).toEqual(["health_gym"]);
  expect(filterOptions(options, "health_g").map((x) => x.value)).toEqual(["health_gym"]);
});

test("archived options are never offered, and nothing matches nonsense", () => {
  expect(filterOptions(options, "old")).toEqual([]);
  expect(filterOptions(options, "zzz")).toEqual([]);
});
