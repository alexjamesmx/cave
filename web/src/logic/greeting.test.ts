import { expect, test } from "bun:test";
import { greeting } from "./greeting.ts";

const utc = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 13, h, m));

test("the part of day follows the settings timezone, not the device's", () => {
  // 14:30 UTC is 08:30 in Mexico City (UTC-6) and 23:30 in Tokyo.
  expect(greeting(utc(14, 30), "America/Mexico_City", "Alex")).toBe("Good morning, Alex");
  expect(greeting(utc(14, 30), "Asia/Tokyo", "Alex")).toBe("Good evening, Alex");
  expect(greeting(utc(14, 30), "UTC", "Alex")).toBe("Good afternoon, Alex");
});

test("boundaries: 05:00 morning, 12:00 afternoon, 18:00 evening, 04:59 evening", () => {
  expect(greeting(utc(5), "UTC", "A")).toBe("Good morning, A");
  expect(greeting(utc(12), "UTC", "A")).toBe("Good afternoon, A");
  expect(greeting(utc(18), "UTC", "A")).toBe("Good evening, A");
  expect(greeting(utc(4, 59), "UTC", "A")).toBe("Good evening, A");
});

test("no name, or only spaces, greets without one", () => {
  expect(greeting(utc(9), "UTC", undefined)).toBe("Good morning");
  expect(greeting(utc(9), "UTC", "  ")).toBe("Good morning");
  expect(greeting(utc(9), "UTC", " Alex ")).toBe("Good morning, Alex");
});
