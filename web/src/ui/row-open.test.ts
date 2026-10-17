import { expect, test } from "bun:test";
import { isOpenKey } from "./row-open.ts";

test("Enter and Space open a focused row; other keys don't", () => {
  expect(["Enter", " ", "Tab", "Escape", "a"].map(isOpenKey)).toEqual([
    true,
    true,
    false,
    false,
    false,
  ]);
});
