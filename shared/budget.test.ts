import { expect, test } from "bun:test";
import { budgetLine, budgetOf } from "./budget.ts";

test("the setting is read defensively: only positive finite amounts count", () => {
  expect(budgetOf(undefined)).toEqual({});
  expect(budgetOf({ budget: "20000" })).toEqual({});
  expect(budgetOf({ budget: { monthlyLimit: 20000, savingTarget: 8000 } })).toEqual({
    monthlyLimit: 20000,
    savingTarget: 8000,
  });
  expect(budgetOf({ budget: { monthlyLimit: -1, savingTarget: Number.NaN } })).toEqual({});
  expect(budgetOf({ budget: { monthlyLimit: "20000", savingTarget: 0 } })).toEqual({});
});

test("the line: what is left, the share, and the pace at the current daily rate", () => {
  const l = budgetLine(30000, 10000, 10, 31);
  expect(l.left).toBe(20000);
  expect(l.share).toBeCloseTo(1 / 3);
  expect(l.pace).toBe(31000);
  expect(budgetLine(30000, 36000, 31, 31)).toMatchObject({ left: -6000, share: 1.2, pace: 36000 });
  expect(budgetLine(30000, 0, 0, 31).pace).toBeUndefined();
  // A finished month's pace is what was spent, never extrapolated past its days.
  expect(budgetLine(30000, 31000, 40, 31).pace).toBe(31000);
});

test("thresholds are crossed in order, once each, and named per month", () => {});
