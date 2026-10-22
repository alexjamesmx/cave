import { expect, test } from "bun:test";
import { offsetAt } from "./time.ts";

const HOUR = 60 * 60 * 1000;

test("Mexico City is UTC-6 all year (no DST since 2022)", () => {
  expect(offsetAt(Date.parse("2026-01-12T15:30:00Z"), "America/Mexico_City")).toBe(-6 * HOUR);
  expect(offsetAt(Date.parse("2026-07-12T15:30:00Z"), "America/Mexico_City")).toBe(-6 * HOUR);
});

test("respects DST on either side of a change", () => {
  expect(offsetAt(Date.parse("2026-07-01T16:00:05Z"), "America/New_York")).toBe(-4 * HOUR);
  expect(offsetAt(Date.parse("2026-01-01T17:00:00Z"), "America/New_York")).toBe(-5 * HOUR);
});
