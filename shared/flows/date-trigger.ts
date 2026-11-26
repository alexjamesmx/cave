import { type Lead, leadPoints } from "../lead.ts";
import {
  dueInstant,
  formatWall,
  MAX_STEPS,
  occurrence,
  parseWall,
  type Repeat,
  type Zone,
} from "../recurrence.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One moment a date arrives: the date itself, or a point of its lead-up. */
export interface Arrival {
  date: string;
  at: number;
  /** The lead-up point, when this is one. */
  point?: string;
}

/**
 * "When a date arrives": the newest time a date came due, `before` days early, up to `now`.
 * The stored date arrives; when the item repeats, so does each date of its series after it
 * (counted from `anchor`, the series start, which a snooze leaves in place), so a monthly
 * date fires each month without anyone moving it, and moving it (Done, a snooze) never fires
 * the same date twice. With `lead`, each date also arrives at each point of its lead-up
 * (`shared/lead.ts`), only after the series' previous date. `date` names the occurrence and
 * `point` the lead-up point, so each runs a flow once. Undefined until the first arrival.
 */
export function latestArrival(
  value: unknown,
  repeat: Repeat,
  before: number,
  now: number,
  zone: Zone,
  anchor: unknown = value,
  lead?: Lead,
): Arrival | undefined {
  const stored = parseWall(value);
  if (!stored) return undefined;
  const early = before * DAY_MS;
  const instant = (date: string) => dueInstant(date, zone) ?? Number.POSITIVE_INFINITY;
  const arrivals = (date: string, previous?: string): Arrival[] => [
    ...(lead ? leadPoints(date, lead, previous) : []).map((point) => ({
      date,
      at: instant(point),
      point,
    })),
    { date, at: instant(date) - early },
  ];
  const start = parseWall(anchor) ?? stored;
  const first = formatWall(stored);
  let last: Arrival | undefined;
  let previous: string | undefined;
  for (let k = 0; k <= MAX_STEPS; k++) {
    const date = k === 0 ? first : formatWall(occurrence(start, repeat, k));
    if (k > 0 && instant(date) <= instant(first)) continue;
    const found = arrivals(date, previous);
    if (Math.min(...found.map((a) => a.at)) > now) break;
    for (const a of found) if (a.at <= now && (!last || a.at > last.at)) last = a;
    if (repeat === "none") break;
    previous = date;
  }
  return last;
}
