import { expect, test } from "bun:test";
import { localToUtcIso } from "./time.ts";

test("Mexico City local time converts to UTC (UTC-6, no DST since 2022)", () => {
  expect(localToUtcIso("2026-10-12T09:30", "America/Mexico_City")).toBe("2026-10-12T15:30:00.000Z");
  expect(localToUtcIso("2026-10-12", "America/Mexico_City")).toBe("2026-10-12T06:00:00.000Z");
});

test("respects DST on either side of a change", () => {
  expect(localToUtcIso("2026-07-01T12:00:05", "America/New_York")).toBe("2026-07-01T16:00:05.000Z");
  expect(localToUtcIso("2026-01-01T12:00", "America/New_York")).toBe("2026-01-01T17:00:00.000Z");
});

test("rejects anything that is not a local date or date-time", () => {
  expect(localToUtcIso("2026-10-12T09:30Z", "UTC")).toBeUndefined();
  expect(localToUtcIso("yesterday", "UTC")).toBeUndefined();
});
