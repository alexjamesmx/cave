import { expect, test } from "bun:test";
import { change, heatLevel, whereLink } from "./overview.ts";

test("a category in Year opens Transactions for that year only, not every year", () => {
  expect(whereLink({ kind: "year", key: "2026" }, "food")).toBe(
    "/money/transactions?month=2026&category=food",
  );
  expect(whereLink({ kind: "month", key: "2026-10" }, "food")).toBe(
    "/money/transactions?month=2026-10&category=food",
  );
  expect(whereLink({ kind: "year", key: "2026" }, null)).toBe(
    "/money/transactions?month=2026&chip=review",
  );
});

test("a change reads as an arrow and a percentage, same, or new", () => {
  expect(change(79, 100)).toEqual({ text: "↓ 21%", dir: "down" });
  expect(change(102, 100)).toEqual({ text: "↑ 2%", dir: "up" });
  expect(change(100, 100)).toEqual({ text: "same", dir: "same" });
  expect(change(50, 0)).toEqual({ text: "new", dir: "new" });
  expect(change(0, 0)).toEqual({ text: "same", dir: "same" });
});

test("heat levels against the biggest value", () => {
  expect([0, 10, 40, 70, 100].map((v) => heatLevel(v, 100))).toEqual([0, 1, 2, 3, 3]);
  expect(heatLevel(5, 0)).toBe(0);
});
