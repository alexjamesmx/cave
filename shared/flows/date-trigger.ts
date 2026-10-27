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
 * "When a date arrives": the newest time a date came due, `before` days early, up to `now`.
 * The stored date arrives; when the item repeats, so does each date of its series after it
 * (counted from `anchor`, the series start, which a snooze leaves in place), so a monthly
 * date fires each month without anyone moving it, and moving it (Done, a snooze) never fires
 * the same date twice. `date` names the occurrence, so each one runs a flow once. Undefined
 * until the first arrival.
 */
export function latestArrival(
  value: unknown,
  repeat: Repeat,
  before: number,
  now: number,
  zone: Zone,
  anchor: unknown = value,
): { date: string; at: number } | undefined {
  const stored = parseWall(value);
  if (!stored) return undefined;
  const early = before * DAY_MS;
  const arrival = (date: string) => ({
    date,
    at: (dueInstant(date, zone) ?? Number.POSITIVE_INFINITY) - early,
  });
  const first = arrival(formatWall(stored));
  if (first.at > now) return undefined;
  const start = parseWall(anchor) ?? stored;
  let last = first;
  if (repeat === "none") return last;
  for (let k = 1; k <= MAX_STEPS; k++) {
    const next = arrival(formatWall(occurrence(start, repeat, k)));
    if (next.at > now) break;
    if (next.at > last.at) last = next;
  }
  return last;
}
