import { describe, expect, test } from "bun:test";
import {
  anchorOf,
  complete,
  dueInstant,
  isOverdue,
  nextDue,
  snooze,
  snoozeTo,
  upcoming,
  type Zone,
} from "./reminders.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const NY: Zone = { timeZone: "America/New_York", defaultTime: "09:00" };
const iso = (ms: number | undefined) => (ms === undefined ? undefined : new Date(ms).toISOString());
const at = (utc: string) => Date.parse(utc);

describe("dueInstant", () => {
  test("a local time in the settings timezone", () => {
    expect(iso(dueInstant("2026-10-22T09:00", MX))).toBe("2026-10-22T15:00:00.000Z");
  });

  test("a date-only due uses the reminder time", () => {
    expect(iso(dueInstant("2026-10-22", MX))).toBe("2026-10-22T15:00:00.000Z");
    expect(iso(dueInstant("2026-10-22", { ...MX, defaultTime: "07:30" }))).toBe(
      "2026-10-22T13:30:00.000Z",
    );
  });

  test("a time the clocks skip lands after the jump", () => {
    // New York, 2026-03-08: 02:00 EST jumps to 03:00 EDT, so 02:30 does not exist.
    expect(iso(dueInstant("2026-03-08T02:30", NY))).toBe("2026-03-08T07:30:00.000Z");
    expect(iso(dueInstant("2026-03-08T03:30", NY))).toBe("2026-03-08T07:30:00.000Z");
    expect(iso(dueInstant("2026-03-08T01:30", NY))).toBe("2026-03-08T06:30:00.000Z");
  });

  test("a time the clocks pass twice is the first of the two", () => {
    // New York, 2026-11-01: 02:00 EDT falls back to 01:00 EST, so 01:30 happens twice.
    expect(iso(dueInstant("2026-11-01T01:30", NY))).toBe("2026-11-01T05:30:00.000Z");
    expect(iso(dueInstant("2026-11-01T02:30", NY))).toBe("2026-11-01T07:30:00.000Z");
  });

  test("anything that isn't a local date is undefined", () => {
    for (const bad of [undefined, null, 5, "", "tomorrow", "2026-10-22T09:00Z"]) {
      expect(dueInstant(bad, MX)).toBeUndefined();
    }
  });
});

describe("nextDue", () => {
  const now = at("2026-10-15T16:00:00Z"); // Thu 10:00 in Mexico City

  test("daily and weekly step forward from the anchor", () => {
    expect(nextDue("2026-10-15T09:00", "daily", now, MX)).toBe("2026-10-16T09:00");
    expect(nextDue("2026-10-15T11:00", "daily", now, MX)).toBe("2026-10-15T11:00");
    expect(nextDue("2026-10-12T09:00", "weekly", now, MX)).toBe("2026-10-19T09:00");
  });

  test("a long gap skips every missed occurrence", () => {
    expect(nextDue("2025-01-01T09:00", "daily", now, MX)).toBe("2026-10-16T09:00");
    expect(nextDue("2020-03-02T08:00", "weekly", now, MX)).toBe("2026-10-19T08:00");
    expect(nextDue("2019-10-22", "yearly", now, MX)).toBe("2026-10-22");
  });

  test("monthly clamps the 31st to short months and returns to it", () => {
    const series = ["2026-01-31T09:00"];
    for (let i = 0; i < 5; i++) {
      const last = series.at(-1) as string;
      series.push(
        nextDue("2026-01-31T09:00", "monthly", dueInstant(last, MX) as number, MX) as string,
      );
    }
    expect(series).toEqual([
      "2026-01-31T09:00",
      "2026-02-28T09:00",
      "2026-03-31T09:00",
      "2026-04-30T09:00",
      "2026-05-31T09:00",
      "2026-06-30T09:00",
    ]);
  });

  test("yearly keeps Feb 29 in leap years and Feb 28 in the others", () => {
    const after = (local: string) => dueInstant(local, MX) as number;
    expect(nextDue("2024-02-29", "yearly", after("2024-02-29"), MX)).toBe("2025-02-28");
    expect(nextDue("2024-02-29", "yearly", after("2027-02-28"), MX)).toBe("2028-02-29");
  });

  test("a date-only series stays date-only", () => {
    expect(nextDue("2026-10-22", "monthly", at("2026-10-22T16:00:00Z"), MX)).toBe("2026-11-22");
  });

  test("no series without a repeat or a valid anchor", () => {
    expect(nextDue("2026-10-22", "none", now, MX)).toBeUndefined();
    expect(nextDue("soon", "daily", now, MX)).toBeUndefined();
  });
});

describe("complete", () => {
  const now = at("2026-10-15T16:00:00Z");

  test("a reminder that doesn't repeat is done", () => {
    expect(complete({ data: { due: "2026-10-15T09:00", repeat: "none" } }, now, MX)).toEqual({
      done: true,
    });
    expect(complete({ data: { due: "2026-10-15T09:00" } }, now, MX)).toEqual({ done: true });
    expect(complete({ data: { repeat: "daily" } }, now, MX)).toEqual({ done: true });
  });

  test("a monthly reminder moves a month and stays open", () => {
    expect(complete({ data: { due: "2026-10-15T09:00", repeat: "monthly" } }, now, MX)).toEqual({
      due: "2026-11-15T09:00",
    });
  });

  test("finishing early still advances it past the current due", () => {
    const r = { data: { due: "2026-10-22T09:00", repeat: "monthly" } };
    expect(complete(r, now, MX)).toEqual({ due: "2026-11-22T09:00" });
  });

  test("a repeating reminder ticked done by hand is reopened", () => {
    const r = { data: { due: "2026-10-15T09:00", repeat: "daily", done: true } };
    expect(complete(r, now, MX)).toEqual({ due: "2026-10-16T09:00", done: false });
  });

  test("the month-end anchor is kept while clamped and dropped when back on its day", () => {
    const jan31 = { data: { due: "2026-01-31T09:00", repeat: "monthly" } };
    const feb = complete(jan31, at("2026-01-31T16:00:00Z"), MX);
    expect(feb).toEqual({ due: "2026-02-28T09:00", _repeatFrom: "2026-01-31T09:00" });
    const mar = complete(
      { data: { ...jan31.data, ...feb }, stamps: { due: "b", _repeatFrom: "b" } },
      at("2026-02-28T16:00:00Z"),
      MX,
    );
    expect(mar).toEqual({ due: "2026-03-31T09:00", _repeatFrom: null });
  });

  test("a snoozed repeat returns to its series, not to the snoozed time", () => {
    const rent = { data: { due: "2026-10-22T09:00", repeat: "monthly" } };
    const snoozed = snoozeTo(rent, "2026-10-23T18:00");
    expect(snoozed).toEqual({ due: "2026-10-23T18:00", _repeatFrom: "2026-10-22T09:00" });
    const done = complete(
      { data: { ...rent.data, ...snoozed }, stamps: { due: "s", _repeatFrom: "s" } },
      at("2026-10-24T00:30:00Z"),
      MX,
    );
    expect(done).toEqual({ due: "2026-11-22T09:00", _repeatFrom: null });
  });

  test("a due edited after the anchor starts a new series", () => {
    const r = {
      data: { due: "2026-10-25T09:00", repeat: "monthly", _repeatFrom: "2026-10-22T09:00" },
      stamps: { _repeatFrom: "0001", due: "0002" },
    };
    expect(anchorOf(r)).toBe("2026-10-25T09:00");
    expect(complete(r, now, MX)).toEqual({ due: "2026-11-25T09:00", _repeatFrom: null });
  });
});

describe("snooze", () => {
  test("now plus minutes, in local time, keeping the series of a repeat", () => {
    const now = at("2026-10-15T16:03:40Z");
    expect(snooze({ data: { due: "2026-10-15T09:00" } }, 10, now, "America/Mexico_City")).toEqual({
      due: "2026-10-15T10:13",
    });
    expect(
      snooze(
        { data: { due: "2026-10-15T09:00", repeat: "daily" } },
        60,
        now,
        "America/Mexico_City",
      ),
    ).toEqual({ due: "2026-10-15T11:03", _repeatFrom: "2026-10-15T09:00" });
  });
});

describe("overdue and upcoming", () => {
  const now = at("2026-10-15T16:00:00Z");

  test("overdue means open with a due at or before now", () => {
    expect(isOverdue({ data: { due: "2026-10-15T09:00" } }, now, MX)).toBe(true);
    expect(isOverdue({ data: { due: "2026-10-15T09:00", done: true } }, now, MX)).toBe(false);
    expect(isOverdue({ data: { due: "2026-10-15T11:00" } }, now, MX)).toBe(false);
    expect(isOverdue({ data: {} }, now, MX)).toBe(false);
  });

  test("upcoming lists computed occurrences after due within the range", () => {
    const r = { data: { due: "2026-10-22T09:00", repeat: "weekly" } };
    const from = at("2026-10-01T06:00:00Z");
    const to = at("2026-11-15T06:00:00Z");
    expect(upcoming(r, from, to, MX)).toEqual([
      "2026-10-29T09:00",
      "2026-11-05T09:00",
      "2026-11-12T09:00",
    ]);
    expect(upcoming({ data: { ...r.data, done: true } }, from, to, MX)).toEqual([]);
    expect(upcoming({ data: { due: "2026-10-22T09:00" } }, from, to, MX)).toEqual([]);
  });
});
