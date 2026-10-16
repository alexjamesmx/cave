/**
 * The recurrence engine (M7b part 6): `due`, `repeat`, the series anchor and the month-end
 * clamp, for any item that repeats: reminders, tasks and payments.
 */
import { localDateTime } from "./dates.ts";
import { offsetAt } from "./time.ts";
import type { Stamp } from "./types.ts";

export const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

/** What a date-only `due` means when it has no time; `settings.reminderTime` overrides it. */
export const DEFAULT_REMINDER_TIME = "09:00";

/** Where local times are read: the settings timezone and the time for date-only values. */
export interface Zone {
  timeZone: string;
  defaultTime: string;
}

/** An item with `due` and `repeat` (a reminder, a task, a payment) and, when it has them, its stamps. */
export interface ReminderLike {
  data: Record<string, unknown>;
  stamps?: Record<string, Stamp>;
}

interface Wall {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  /** Whether the value carried a time; a date-only value keeps being date-only. */
  timed: boolean;
}

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The zone the `settings` doc names; `fallbackTimeZone` when it names none. */
export function zoneOf(
  settings: Record<string, unknown> | undefined,
  fallbackTimeZone: string,
): Zone {
  const tz = settings?.timezone;
  const time = settings?.reminderTime;
  return {
    timeZone: typeof tz === "string" ? tz : fallbackTimeZone,
    defaultTime: typeof time === "string" && CLOCK_RE.test(time) ? time : DEFAULT_REMINDER_TIME,
  };
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseWall(local: unknown): Wall | undefined {
  if (typeof local !== "string") return undefined;
  const m = LOCAL_RE.exec(local);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const timed = m[4] !== undefined;
  return { y, mo, d, h: timed ? Number(m[4]) : 0, mi: timed ? Number(m[5]) : 0, timed };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatWall(w: Wall): string {
  const date = `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
  return w.timed ? `${date}T${pad(w.h)}:${pad(w.mi)}` : date;
}

const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/**
 * The UTC instant of a local wall time in `timeZone`. A time the clocks skip (a DST gap) is
 * read with the offset before the change, so it lands after the jump (02:30 → 03:30). A time
 * the clocks pass twice (an overlap) is the first of the two.
 */
export function zonedInstant(wall: number, timeZone: string): number {
  const early = offsetAt(wall - DAY_MS, timeZone);
  const late = offsetAt(wall + DAY_MS, timeZone);
  const fits = (offset: number) => offsetAt(wall - offset, timeZone) === offset;
  const candidates = [early, late].filter(fits).map((offset) => wall - offset);
  return candidates.length > 0 ? Math.min(...candidates) : wall - early;
}

/** A local `YYYY-MM-DD[THH:mm]` as a UTC instant; a date-only value uses `defaultTime`. */
export function dueInstant(due: unknown, zone: Zone): number | undefined {
  const w = parseWall(due);
  if (!w) return undefined;
  const time = TIME_RE.exec(zone.defaultTime) ?? TIME_RE.exec(DEFAULT_REMINDER_TIME);
  const [h, mi] = w.timed ? [w.h, w.mi] : [Number(time?.[1]), Number(time?.[2])];
  return zonedInstant(Date.UTC(w.y, w.mo - 1, w.d, h, mi), zone.timeZone);
}

/** Occurrence `k` of the series that starts at `anchor`, clamping month ends to the anchor day. */
export function occurrence(anchor: Wall, repeat: Repeat, k: number): Wall {
  switch (repeat) {
    case "daily":
    case "weekly": {
      const step = repeat === "daily" ? k : 7 * k;
      const at = new Date(Date.UTC(anchor.y, anchor.mo - 1, anchor.d + step));
      return { ...anchor, y: at.getUTCFullYear(), mo: at.getUTCMonth() + 1, d: at.getUTCDate() };
    }
    case "monthly": {
      const index = anchor.y * 12 + (anchor.mo - 1) + k;
      const y = Math.floor(index / 12);
      const mo = (index % 12) + 1;
      return { ...anchor, y, mo, d: Math.min(anchor.d, daysIn(y, mo)) };
    }
    case "yearly": {
      const y = anchor.y + k;
      return { ...anchor, y, d: Math.min(anchor.d, daysIn(y, anchor.mo)) };
    }
    case "none":
      return anchor;
  }
}

// Ten years of daily occurrences: further than any real gap, and a bound on a bad value.
export const MAX_STEPS = 3700;

/**
 * The first occurrence of the series starting at `anchor` that falls after `after`, so missed
 * ones are skipped. Monthly and yearly keep the anchor's day: the 31st becomes the 30th or the
 * 28th/29th in shorter months and returns to the 31st when it can; Feb 29 does the same.
 */
export function nextDue(
  anchor: string,
  repeat: Repeat,
  after: number,
  zone: Zone,
): string | undefined {
  const start = parseWall(anchor);
  if (!start || repeat === "none") return undefined;
  for (let k = 0; k <= MAX_STEPS; k++) {
    const next = formatWall(occurrence(start, repeat, k));
    if ((dueInstant(next, zone) ?? 0) > after) return next;
  }
  return undefined;
}

export const repeatOf = (data: Record<string, unknown>): Repeat =>
  REPEATS.includes(data.repeat as Repeat) ? (data.repeat as Repeat) : "none";

/**
 * Where a repeating item's series starts. A snooze or a month-end clamp moves `due` off
 * the series, so the series start is kept in `_repeatFrom`. A `due` written later than that
 * (an owner or agent edit) starts a new series from itself.
 */
export function anchorOf(r: ReminderLike): string | undefined {
  const from = r.data._repeatFrom;
  const due = typeof r.data.due === "string" ? r.data.due : undefined;
  if (typeof from !== "string" || !parseWall(from)) return due;
  const fromStamp = r.stamps?._repeatFrom ?? "";
  const dueStamp = r.stamps?.due ?? "";
  return fromStamp >= dueStamp ? from : due;
}

/**
 * Moves a repeating item to its next occurrence after both now and its current `due`
 * (finishing early still advances it), keeping the series' day through month ends. `undefined`
 * when it doesn't repeat or has no usable `due`: the caller decides what "done" means then.
 */
export function advance(
  r: ReminderLike,
  now: number,
  zone: Zone,
): Record<string, unknown> | undefined {
  const repeat = repeatOf(r.data);
  const dueAt = dueInstant(r.data.due, zone);
  const anchor = anchorOf(r);
  if (repeat === "none" || dueAt === undefined || anchor === undefined) return undefined;
  const next = nextDue(anchor, repeat, Math.max(now, dueAt), zone);
  if (!next) return undefined;
  const patch: Record<string, unknown> = { due: next };
  const clamped = next.slice(8, 10) !== anchor.slice(8, 10);
  if ((repeat === "monthly" || repeat === "yearly") && clamped) patch._repeatFrom = anchor;
  else if (r.data._repeatFrom !== undefined && r.data._repeatFrom !== null)
    patch._repeatFrom = null;
  return patch;
}

/** The field changes that move an item to the local time `due`, keeping its series. */
export function snoozeTo(r: ReminderLike, due: string): Record<string, unknown> {
  const patch: Record<string, unknown> = { due };
  const anchor = anchorOf(r);
  if (repeatOf(r.data) !== "none" && anchor !== undefined) patch._repeatFrom = anchor;
  return patch;
}

/** `due` becomes now plus `minutes`, in local time. */
export function snooze(
  r: ReminderLike,
  minutes: number,
  now: number,
  timeZone: string,
): Record<string, unknown> {
  return snoozeTo(r, localDateTime(new Date(now + minutes * 60_000), timeZone));
}
