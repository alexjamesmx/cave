import { expect, test } from "bun:test";
import {
  dayOf,
  daysInMonth,
  localDate,
  localDateTime,
  monthGrid,
  shiftMonth,
  shortDay,
} from "./dates.ts";

test("local dates follow the settings timezone", () => {
  const at = new Date("2026-10-13T03:30:00Z");
  expect(localDate(at, "America/Mexico_City")).toBe("2026-10-12");
  expect(localDateTime(at, "America/Mexico_City")).toBe("2026-10-12T21:30");
  expect(localDate(at, "UTC")).toBe("2026-10-13");
});

test("day and month helpers", () => {
  expect(dayOf("2026-10-07T13:05:00")).toBe("2026-10-07");
  expect(dayOf(undefined)).toBeUndefined();
  expect(daysInMonth("2026-02")).toBe(28);
  expect(daysInMonth("2028-02")).toBe(29);
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shortDay("2026-10-07")).toBe("Oct 7");
});

test("month grid starts on Monday and pads with null", () => {
  const grid = monthGrid("2026-10");
  expect(grid[0]).toEqual([
    null,
    null,
    null,
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
  ]);
  expect(grid.flat().filter(Boolean)).toHaveLength(31);
  expect(grid.every((week) => week.length === 7)).toBe(true);
});
