import { expect, test } from "bun:test";
import { parseWhen } from "./when-field.ts";

const ctx = {
  now: new Date("2026-10-15T16:00:00Z"), // Thu 10:00 in Mexico City
  timeZone: "America/Mexico_City",
  reminderTime: "09:00",
};

test("When reads plain language in English and Spanish, and nothing else", () => {
  expect(parseWhen("tomorrow 9am", ctx)).toMatchObject({
    ok: true,
    due: "2026-10-16T09:00",
    repeat: "none",
  });
  expect(parseWhen("cada mes 22 9:00", ctx)).toMatchObject({
    ok: true,
    due: "2026-10-22T09:00",
    repeat: "monthly",
  });
  expect(parseWhen("in 2h", ctx)).toMatchObject({ ok: true, due: "2026-10-15T12:00" });
  expect(parseWhen("", ctx)).toEqual({ ok: false, hint: "Add when." });
  expect(parseWhen("whenever", ctx).ok).toBe(false);
});
