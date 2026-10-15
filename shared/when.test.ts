import { describe, expect, test } from "bun:test";
import { type Parsed, parseReminder, preview, type WhenContext } from "./when.ts";

const ctx = (utc: string): WhenContext => ({
  now: new Date(utc),
  timeZone: "America/Mexico_City",
  reminderTime: "09:00",
});
// Thursday 2026-10-15, 10:00 in Mexico City (UTC−6).
const THU = ctx("2026-10-15T16:00:00Z");
const FRI = ctx("2026-10-16T16:00:00Z");
const OCT30 = ctx("2026-10-30T16:00:00Z");
const DEC31 = ctx("2026-12-31T16:00:00Z");

type Row = [input: string, title: string, due: string, repeat?: string, at?: WhenContext];

const ACCEPTED: Row[] = [
  ["pay rent tomorrow 9am", "Pay rent", "2026-10-16T09:00"],
  ["llamar a mamá vie 18:00", "Llamar a mamá", "2026-10-16T18:00"],
  ["stretch in 2h", "Stretch", "2026-10-15T12:00"],
  ["dentist 22 oct 10:30", "Dentist", "2026-10-22T10:30"],
  ["renta every month 22 9:00", "Renta", "2026-10-22T09:00", "monthly"],
  ["call bank today 18:00", "Call bank", "2026-10-15T18:00"],
  ["call bank hoy 18:00", "Call bank", "2026-10-15T18:00"],
  ["gym mañana 7am", "Gym", "2026-10-16T07:00"],
  ["gym manana 7am", "Gym", "2026-10-16T07:00"],
  ["water plants tomorrow", "Water plants", "2026-10-16"],
  ["standup mon 9:30", "Standup", "2026-10-19T09:30"],
  ["standup monday 9:30am", "Standup", "2026-10-19T09:30"],
  ["review fri", "Review", "2026-10-16"],
  ["review thu 18:00", "Review", "2026-10-15T18:00"],
  ["review thu 8:00", "Review", "2026-10-22T08:00"],
  ["review next thursday 9am", "Review", "2026-10-22T09:00"],
  ["review next fri 9am", "Review", "2026-10-16T09:00"],
  ["review next friday", "Review", "2026-10-23", "none", FRI],
  ["review friday 18:00", "Review", "2026-10-16T18:00", "none", FRI],
  ["cena el viernes 18:00", "Cena", "2026-10-16T18:00"],
  ["cena próximo viernes", "Cena", "2026-10-16"],
  ["tea in 30 min", "Tea", "2026-10-15T10:30"],
  ["tea in 3 days", "Tea", "2026-10-18T10:00"],
  ["té en 2 horas", "Té", "2026-10-15T12:00"],
  ["té en 1 semana", "Té", "2026-10-22T10:00"],
  ["tea in 2 days at 9am", "Tea", "2026-10-17T09:00"],
  ["tea in 3 days", "Tea", "2026-11-02T10:00", "none", OCT30],
  ["tea in 2d", "Tea", "2027-01-02T10:00", "none", DEC31],
  ["tea tomorrow 8am", "Tea", "2027-01-01T08:00", "none", DEC31],
  ["vote 2026-11-03", "Vote", "2026-11-03"],
  ["vote 2026-11-03 14:00", "Vote", "2026-11-03T14:00"],
  ["show oct 22 9pm", "Show", "2026-10-22T21:00"],
  ["cine 22 de octubre 9:30pm", "Cine", "2026-10-22T21:30"],
  ["cine 22 de octubre de 2027", "Cine", "2027-10-22"],
  ["taxes 5 jan", "Taxes", "2027-01-05"],
  ["taxes 1 dec", "Taxes", "2026-12-01"],
  ["taxes 22 mar", "Taxes", "2027-03-22"],
  ["gym mar 9am", "Gym", "2026-10-20T09:00"],
  ["vitamins every day 7:00", "Vitamins", "2026-10-16T07:00", "daily"],
  ["vitamins every day 18:00", "Vitamins", "2026-10-15T18:00", "daily"],
  ["vitaminas cada día 21:00", "Vitaminas", "2026-10-15T21:00", "daily"],
  ["trash every monday 8am", "Trash", "2026-10-19T08:00", "weekly"],
  ["basura cada lunes 8:00", "Basura", "2026-10-19T08:00", "weekly"],
  ["review every week", "Review", "2026-10-22", "weekly"],
  ["budget every month", "Budget", "2026-11-15", "monthly"],
  ["birthday every year", "Birthday", "2027-10-15", "yearly"],
  ["fees cada mes 31", "Fees", "2026-10-31", "monthly"],
  ["fees every month on the 22nd 9:00", "Fees", "2026-10-22T09:00", "monthly"],
  ["fees every month 15 9:00", "Fees", "2026-11-15T09:00", "monthly"],
  ["fees every month 15 9:00", "Fees", "2027-01-15T09:00", "monthly", DEC31],
  ["dues 22 oct monthly", "Dues", "2026-10-22", "monthly"],
  ["buy 2 tomorrow", "Buy 2", "2026-10-16"],
  ["call 3 people at 5pm tomorrow", "Call 3 people", "2026-10-16T17:00"],
  ["me to call mom tomorrow 9", "Call mom", "2026-10-16T09:00"],
  ["tomorrow 9am call mom", "Call mom", "2026-10-16T09:00"],
  ["feed cat 12am tomorrow", "Feed cat", "2026-10-16T00:00"],
  ["lunch tomorrow 12pm", "Lunch", "2026-10-16T12:00"],
  ["lunch a las 14:00 mañana", "Lunch", "2026-10-16T14:00"],
  ["visit pasado mañana", "Visit", "2026-10-17"],
  ["fix 25:00 tomorrow", "Fix 25:00", "2026-10-16"],
];

const REFUSED: [input: string, hint: string][] = [
  ["standup today 8am", "already passed"],
  ["standup 18:00", "Add a day"],
  ["just some text", "Add when"],
  ["tomorrow 9am", "What should I remind you about?"],
  ["pay 31 nov", "Add when"],
  ["meet tomorrow fri", "one day, not two"],
  ["tea in 2h at 9am", "not both"],
];

describe("parseReminder", () => {
  test(`accepts ${ACCEPTED.length} entries, in English and Spanish`, () => {
    for (const [input, title, due, repeat = "none", at = THU] of ACCEPTED) {
      const got = parseReminder(input, at);
      expect({ input, got }).toEqual({
        input,
        got: { ok: true, title, due, repeat, timeDefaulted: !due.includes("T") } as Parsed,
      });
    }
  });

  test("refuses what it can't place, with a hint", () => {
    for (const [input, hint] of REFUSED) {
      const got = parseReminder(input, THU);
      expect({ input, ok: got.ok }).toEqual({ input, ok: false });
      expect(got.ok ? "" : got.hint).toContain(hint);
    }
  });
});

describe("preview", () => {
  test("names the day, the time and the repeat before anything is saved", () => {
    const rent = parseReminder("pay rent every month 22 9:00", THU);
    expect(rent.ok && preview(rent, THU)).toBe("Reminder · Pay rent · Thu Oct 22, 09:00 · monthly");
  });

  test("says when the reminder time applies, and the year when it isn't this one", () => {
    const water = parseReminder("water plants tomorrow", THU);
    expect(water.ok && preview(water, THU)).toBe(
      "Reminder · Water plants · Fri Oct 16, 09:00 (reminder time)",
    );
    const taxes = parseReminder("taxes 5 jan 10:00", THU);
    expect(taxes.ok && preview(taxes, THU)).toBe("Reminder · Taxes · Tue Jan 5 2027, 10:00");
  });
});
