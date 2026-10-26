import { expect, test } from "bun:test";
import type { RoutineBlock } from "../../../shared/routine.ts";
import type { CalendarEvent } from "./calendar.ts";
import { dayPlan } from "./day-plan.ts";

const event = (key: string, time?: string): CalendarEvent => ({
  key,
  itemId: key,
  collection: "reminders",
  title: key,
  due: time ? `2026-10-15T${time}` : "2026-10-15",
  day: "2026-10-15",
  time,
  at: 0,
  done: false,
  overdue: false,
  repeat: false,
});
const block = (id: string, start?: string): RoutineBlock => ({
  id,
  title: id,
  kind: start ? "fixed" : "daily",
  minutes: 30,
  ...(start ? { start, days: [3] } : {}),
});

test("all-day first, then by time with a block before an event at the same minute, untimed blocks last", () => {
  const plan = dayPlan(
    [block("walk"), block("work", "09:00"), block("gym", "18:00")],
    [event("dentist", "17:30"), event("rent"), event("standup", "09:00")],
  );
  expect(plan.map((e) => e.key)).toEqual([
    "rent",
    "block-work",
    "standup",
    "dentist",
    "block-gym",
    "block-walk",
  ]);
  expect(dayPlan([], [])).toEqual([]);
});
