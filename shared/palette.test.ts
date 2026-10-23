import { expect, test } from "bun:test";
import { PALETTE, RETIRED, recolour } from "./palette.ts";

test("every retired colour maps to a palette colour, case-insensitively", () => {
  const values = new Set<string>(Object.values(PALETTE));
  for (const [old, next] of Object.entries(RETIRED)) {
    expect(values.has(next)).toBe(true);
    expect(recolour(old.toLowerCase())).toBe(next);
  }
});

test("other colours and non-strings pass through", () => {
  expect(recolour("#123456")).toBe("#123456");
  expect(recolour(undefined)).toBeUndefined();
});
