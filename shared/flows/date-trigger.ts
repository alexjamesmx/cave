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

/**
 * "When a date arrives": the newest time a date field came due, `before` days early, up to
 * `now`. A field that repeats (the item's `repeat`) arrives on every date of its series, so a
 * monthly date fires each month without anyone moving it. `date` names the occurrence, so each
 * one runs a flow once. Undefined until the first arrival.
 */
export function latestArrival(
  value: unknown,
  repeat: Repeat,
  before: number,
  now: number,
  zone: Zone,
): { date: string; at: number } | undefined {
  const start = parseWall(value);
  if (!start) return undefined;
  const early = before * DAY_MS;
  let last: { date: string; at: number } | undefined;
  const steps = repeat === "none" ? 0 : MAX_STEPS;
  for (let k = 0; k <= steps; k++) {
    const date = formatWall(occurrence(start, repeat, k));
    const at = (dueInstant(date, zone) ?? Number.POSITIVE_INFINITY) - early;
    if (at > now) break;
    last = { date, at };
  }
  return last;
}
