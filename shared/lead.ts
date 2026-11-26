/**
 * A reminder's lead-up (M16): it starts reminding `days` before its date, every `every` days,
 * counted back from the date (and from each date of a repeating series), never from today.
 */
import { formatWall, parseWall } from "./recurrence.ts";

export interface Lead {
  days: number;
  every: number;
}

const positive = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** The item's lead-up; undefined when `lead_days` is off. `every` defaults to daily. */
export function leadOf(data: Record<string, unknown>): Lead | undefined {
  if (!positive(data.lead_days)) return undefined;
  const every = positive(data.lead_every) ? data.lead_every : 1;
  return { days: data.lead_days, every: Math.min(every, data.lead_days) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (day: string) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;

/** Whole days from `from` to `to`, by their local dates. */
export const daysUntil = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/**
 * The lead-up points of `date`, oldest first, at its own time of day. With `after` (the
 * series' previous date), only points after it: a lead-up longer than the repeat starts once
 * the previous date has passed, so no point belongs to two dates.
 */
export function leadPoints(date: string, lead: Lead, after?: string): string[] {
  const wall = parseWall(date);
  if (!wall) return [];
  const points: string[] = [];
  for (let back = lead.days; back > 0; back -= lead.every) {
    const at = new Date(Date.UTC(wall.y, wall.mo - 1, wall.d - back));
    const point = formatWall({
      ...wall,
      y: at.getUTCFullYear(),
      mo: at.getUTCMonth() + 1,
      d: at.getUTCDate(),
    });
    if (after === undefined || point > after) points.push(point);
  }
  return points;
}

/** What a notification adds to the title: how far the date still is. */
export function leadLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "";
  return daysLeft === 1 ? " · tomorrow" : ` · in ${daysLeft} days`;
}
