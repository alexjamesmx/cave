import { expect, test } from "bun:test";
import type { Zone } from "../recurrence.ts";
import { latestArrival } from "./date-trigger.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
// 2026-10-27 12:00 in Mexico City (UTC-6).
const NOW = Date.parse("2026-10-27T18:00:00Z");

test("a one-off date arrives once, on its time or the default time", () => {
  expect(latestArrival("2026-10-27T11:00", "none", 0, NOW, MX)?.date).toBe("2026-10-27T11:00");
  expect(latestArrival("2026-10-27T13:00", "none", 0, NOW, MX)).toBeUndefined();
  expect(latestArrival("2026-10-27", "none", 0, NOW, MX)).toEqual({
    date: "2026-10-27",
    at: Date.parse("2026-10-27T15:00:00Z"),
  });
  expect(latestArrival("not a date", "none", 0, NOW, MX)).toBeUndefined();
});

test("days before move the arrival earlier", () => {
  expect(latestArrival("2026-10-28", "none", 1, NOW, MX)?.date).toBe("2026-10-28");
  expect(latestArrival("2026-10-29", "none", 1, NOW, MX)).toBeUndefined();
});

test("a repeating date arrives on each date of its series, the newest one up to now", () => {
  expect(latestArrival("2026-01-20T09:00", "monthly", 0, NOW, MX)?.date).toBe("2026-10-20T09:00");
  expect(latestArrival("2026-01-31", "monthly", 0, NOW, MX)?.date).toBe("2026-09-30");
  expect(latestArrival("2025-11-28", "yearly", 0, NOW, MX)?.date).toBe("2025-11-28");
  expect(latestArrival("2026-10-28", "monthly", 1, NOW, MX)?.date).toBe("2026-10-28");
  expect(latestArrival("2026-11-05", "monthly", 0, NOW, MX)).toBeUndefined();
});

const WEEK = { days: 7, every: 1 };
const at = (mx: string) => Date.parse(`${mx}-06:00`);

test("a lead-up arrives at each of its points, counted back from the date, then the date", () => {
  expect(latestArrival("2026-12-10", "none", 0, at("2026-12-02T12:00"), MX, undefined, WEEK)).toBe(
    undefined,
  );
  expect(
    latestArrival("2026-12-10", "none", 0, at("2026-12-05T10:00"), MX, undefined, WEEK),
  ).toEqual({
    date: "2026-12-10",
    at: at("2026-12-05T09:00"),
    point: "2026-12-05",
  });
  expect(
    latestArrival("2026-12-10", "none", 0, at("2026-12-10T10:00"), MX, undefined, WEEK),
  ).toEqual({
    date: "2026-12-10",
    at: at("2026-12-10T09:00"),
  });
});

test("a repeating date's lead-up comes before each date of its series", () => {
  const monthly = latestArrival(
    "2026-11-10",
    "monthly",
    0,
    at("2026-12-06T10:00"),
    MX,
    "2026-11-10",
    WEEK,
  );
  expect(monthly).toMatchObject({ date: "2026-12-10", point: "2026-12-06" });
  // Daily with a week's lead-up: the next date has no point before today's date has passed.
  const daily = latestArrival(
    "2026-12-01",
    "daily",
    0,
    at("2026-12-05T10:00"),
    MX,
    undefined,
    WEEK,
  );
  expect(daily).toEqual({ date: "2026-12-05", at: at("2026-12-05T09:00") });
});
