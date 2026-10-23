import { expect, test } from "bun:test";
import { contrast, luminance } from "./contrast.ts";

test("luminance follows the WCAG formula", () => {
  expect(luminance("#000000")).toBe(0);
  expect(luminance("#ffffff")).toBeCloseTo(1, 6);
  expect(luminance("#808080")).toBeCloseTo(0.2159, 3);
  expect(() => luminance("red")).toThrow();
});

test("contrast is symmetric and spans 1 to 21", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 6);
  expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 6);
  expect(contrast("#15171b", "#15171b")).toBe(1);
});
