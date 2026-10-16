import {
  advance,
  anchorOf,
  dueInstant,
  formatWall,
  MAX_STEPS,
  occurrence,
  parseWall,
  type ReminderLike,
  repeatOf,
  type Zone,
} from "./recurrence.ts";

// Reminders are one use of the recurrence engine; everything it exports reads from here too.
export * from "./recurrence.ts";

/**
 * The field changes that complete a reminder. One that doesn't repeat is done. A repeating one
 * moves to its next occurrence and stays open.
 */
export function complete(r: ReminderLike, now: number, zone: Zone): Record<string, unknown> {
  const next = advance(r, now, zone);
  if (!next) return { done: true };
  return r.data.done === true ? { ...next, done: false } : next;
}

export const isOpen = (r: ReminderLike) => r.data.done !== true && r.data._deleted !== true;

export function isOverdue(r: ReminderLike, now: number, zone: Zone): boolean {
  const at = dueInstant(r.data.due, zone);
  return isOpen(r) && at !== undefined && at <= now;
}

/**
 * Future occurrences of an open repeating reminder after its current `due` and within
 * [`from`, `to`], for the calendar. They are computed, never stored.
 */
export function upcoming(r: ReminderLike, from: number, to: number, zone: Zone): string[] {
  const repeat = repeatOf(r.data);
  const dueAt = dueInstant(r.data.due, zone);
  const start = parseWall(anchorOf(r));
  if (!isOpen(r) || repeat === "none" || dueAt === undefined || !start) return [];
  const found: string[] = [];
  for (let k = 0; k <= MAX_STEPS; k++) {
    const at = formatWall(occurrence(start, repeat, k));
    const instant = dueInstant(at, zone) ?? 0;
    if (instant > to) break;
    if (instant > dueAt && instant >= from) found.push(at);
  }
  return found;
}
