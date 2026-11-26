import { expect, test } from "bun:test";
import { daysUntil, leadLabel, leadOf, leadPoints } from "./lead.ts";

test("a week of daily reminders before the date, counted back from it", () => {
  expect(leadPoints("2026-12-10", { days: 7, every: 1 })).toEqual([
    "2026-12-03",
    "2026-12-04",
    "2026-12-05",
    "2026-12-06",
    "2026-12-07",
    "2026-12-08",
    "2026-12-09",
  ]);
});

test("every two days, at the date's own time, across a year end", () => {
  expect(leadPoints("2026-12-10", { days: 7, every: 2 })).toEqual([
    "2026-12-03",
    "2026-12-05",
    "2026-12-07",
    "2026-12-09",
  ]);
  expect(leadPoints("2026-12-10T08:30", { days: 1, every: 1 })).toEqual(["2026-12-09T08:30"]);
  expect(leadPoints("2027-01-02", { days: 3, every: 1 })).toEqual([
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
  ]);
});

test("a lead-up longer than the repeat starts after the previous date", () => {
  expect(leadPoints("2026-12-10", { days: 7, every: 1 }, "2026-12-09")).toEqual([]);
  expect(leadPoints("2026-12-10", { days: 7, every: 1 }, "2026-12-07")).toEqual([
    "2026-12-08",
    "2026-12-09",
  ]);
});

test("off unless lead_days is a positive whole number; every is at most the lead", () => {
  expect(leadOf({})).toBeUndefined();
  expect(leadOf({ lead_days: 0 })).toBeUndefined();
  expect(leadOf({ lead_days: 2.5 })).toBeUndefined();
  expect(leadOf({ lead_days: 7 })).toEqual({ days: 7, every: 1 });
  expect(leadOf({ lead_days: 3, lead_every: 9 })).toEqual({ days: 3, every: 3 });
});

test("labels and day counts", () => {
  expect(leadLabel(0)).toBe("");
  expect(leadLabel(1)).toBe(" · tomorrow");
  expect(leadLabel(3)).toBe(" · in 3 days");
  expect(daysUntil("2026-12-30T09:00", "2027-01-02")).toBe(3);
});
