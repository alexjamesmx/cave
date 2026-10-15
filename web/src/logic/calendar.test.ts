import { expect, test } from "bun:test";
import type { Zone } from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import { byDay, mergeEvents, reminderSource, taskSource } from "./calendar.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const NOW = Date.parse("2026-10-15T16:00:00Z"); // Thu 10:00 local
const OCT = { from: Date.parse("2026-10-01T06:00:00Z"), to: Date.parse("2026-11-01T06:00:00Z") };

const item = (id: string, collection: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection,
  data: { _title: id, ...data },
  stamps: {},
  actor: "test",
});

const reminders = [
  item("rent", "reminders", { due: "2026-10-22T09:00", repeat: "weekly" }),
  item("late", "reminders", { due: "2026-10-14T18:00" }),
  item("old", "reminders", { due: "2026-10-10", done: true }),
  item("gone", "reminders", { due: "2026-10-20T09:00", _deleted: true }),
  item("never", "reminders", { repeat: "daily" }),
];
const tasks = [
  item("ship", "tasks", { due: "2026-10-15", status: "doing" }),
  item("past", "tasks", { due: "2026-10-12", status: "todo" }),
  item("closed", "tasks", { due: "2026-10-16", status: "done" }),
  item("someday", "tasks", { status: "todo" }),
];

test("the calendar merges reminders and tasks in time order, with computed repeats", () => {
  const events = mergeEvents(
    [reminderSource(reminders, MX, NOW), taskSource(tasks, MX, "2026-10-15")],
    OCT,
  );
  expect(events.map((e) => [e.key, e.day, e.time ?? "", e.done, e.overdue, e.repeat])).toEqual([
    ["old", "2026-10-10", "", true, false, false],
    ["past", "2026-10-12", "", false, true, false],
    ["late", "2026-10-14", "18:00", false, true, false],
    ["ship", "2026-10-15", "", false, false, false],
    ["rent", "2026-10-22", "09:00", false, false, false],
    ["rent@2026-10-29T09:00", "2026-10-29", "09:00", false, false, true],
  ]);
});

test("within one moment open entries come before done ones, and days group them", () => {
  const same = [
    item("a", "reminders", { due: "2026-10-20T09:00", done: true }),
    item("b", "reminders", { due: "2026-10-20T09:00" }),
  ];
  const events = mergeEvents([reminderSource(same, MX, NOW)], OCT);
  expect(events.map((e) => e.key)).toEqual(["b", "a"]);
  expect([...byDay(events).keys()]).toEqual(["2026-10-20"]);
});

test("a range outside the month finds nothing stored, only what repeats into it", () => {
  const nov = { from: OCT.to, to: Date.parse("2026-11-08T06:00:00Z") };
  const events = mergeEvents(
    [reminderSource(reminders, MX, NOW), taskSource(tasks, MX, "2026-10-15")],
    nov,
  );
  expect(events.map((e) => e.key)).toEqual(["rent@2026-11-05T09:00"]);
});
