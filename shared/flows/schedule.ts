import { zonedInstant } from "../reminders.ts";
import type { Trigger } from "./registry.ts";

type Schedule = Extract<Trigger, { type: "schedule" }>;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The slot on a local calendar day, if the schedule has one that day (month ends clamp). */
function slotOn(
  s: Schedule,
  y: number,
  m: number,
  d: number,
  timeZone: string,
): number | undefined {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const due =
    s.every === "day" ||
    (s.every === "week" && dow === s.weekday) ||
    (s.every === "month" && d === Math.min(s.day ?? 1, daysIn(y, m))) ||
    (s.every === "year" && m === s.month && d === Math.min(s.day ?? 1, daysIn(y, m)));
  if (!due) return undefined;
  const [h, mi] = s.at.split(":").map(Number) as [number, number];
  return zonedInstant(Date.UTC(y, m - 1, d, h, mi), timeZone);
}

// Walk local days from `start` in `step` direction; a year plus a day covers every schedule.
function walk(
  s: Schedule,
  from: number,
  step: 1 | -1,
  timeZone: string,
  accept: (at: number) => boolean,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(from))
    .split("-")
    .map(Number) as [number, number, number];
  const base = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  for (let i = 0; i <= 367; i++) {
    const day = new Date(base + step * i * DAY_MS);
    const at = slotOn(s, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), timeZone);
    if (at !== undefined && accept(at)) return at;
  }
  return undefined;
}

/** The newest slot at or before `now`. */
export const latestSlot = (s: Schedule, now: number, timeZone: string) =>
  walk(s, now, -1, timeZone, (at) => at <= now);

/** The first slot after `after`, for the calendar and the system view. */
export const nextSlot = (s: Schedule, after: number, timeZone: string) =>
  walk(s, after, 1, timeZone, (at) => at > after);
