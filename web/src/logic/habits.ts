import type { Doc } from "../../../shared/types.ts";
import { dayOf } from "./dates.ts";

/** Journal entries by their `date` day; with two entries for one day, the first one counts. */
export function entriesByDay(journal: Doc[]): Map<string, Doc> {
  const byDay = new Map<string, Doc>();
  for (const doc of journal) {
    const day = dayOf(doc.data.date);
    if (day && !byDay.has(day)) byDay.set(day, doc);
  }
  return byDay;
}

export const habitsDone = (doc: Doc | undefined, habits: string[]) =>
  doc ? habits.filter((h) => doc.data[h] === true) : [];

export function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Consecutive days up to today with the habit done; not done yet today keeps the streak. */
export function streak(byDay: Map<string, Doc>, habit: string, today: string): number {
  let day = byDay.get(today)?.data[habit] === true ? today : previousDay(today);
  let count = 0;
  while (byDay.get(day)?.data[habit] === true) {
    count++;
    day = previousDay(day);
  }
  return count;
}

/** Days the habit was done out of the last `days` days, today included. */
export function doneInLast(byDay: Map<string, Doc>, habit: string, today: string, days: number) {
  let day = today;
  let done = 0;
  for (let i = 0; i < days; i++) {
    if (byDay.get(day)?.data[habit] === true) done++;
    day = previousDay(day);
  }
  return done;
}
