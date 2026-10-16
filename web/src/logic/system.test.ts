import { expect, test } from "bun:test";
import { formatStamp } from "../../../shared/hlc.ts";
import type { Zone } from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import {
  collectionStats,
  flowEntries,
  jobEntries,
  mergeSchedule,
  reminderEntries,
  SCHEDULE_DAYS,
} from "./system.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const NOW = Date.parse("2026-10-15T16:00:00Z"); // Thu 10:00 local
const WEEK = NOW + SCHEDULE_DAYS * 24 * 60 * 60 * 1000;

const item = (id: string, collection: string, data: Record<string, unknown>, ms = NOW): Doc => ({
  id,
  kind: "item",
  collection,
  data: { _title: id, ...data },
  stamps: { _title: formatStamp(ms, 0, "test") },
  actor: "test",
});

test("collection stats count live items and take the newest stamp", () => {
  const stats = collectionStats([
    item("a", "tasks", {}, NOW - 5000),
    item("b", "tasks", {}, NOW - 1000),
    item("c", "tasks", { _deleted: true }, NOW),
    item("d", "money", {}, NOW - 9000),
  ]);
  expect(stats.get("tasks")).toEqual({ collection: "tasks", count: 2, lastChange: NOW - 1000 });
  expect(stats.get("money")?.count).toBe(1);
});

test("the schedule merges reminders, every flow slot, jobs and the deploy check in time order", () => {
  const reminders = [
    item("rent", "reminders", { due: "2026-10-16T09:00", repeat: "none" }),
    item("done", "reminders", { due: "2026-10-16T08:00", done: true }),
    item("past", "reminders", { due: "2026-10-14T09:00" }),
  ];
  const daily = {
    version: 1,
    trigger: { type: "schedule", every: "day", at: "08:00" },
    steps: [{ type: "notify", title: "Morning", open: "calendar" }],
  };
  const flows = [
    item("morning", "flows", { status: "on", definition: daily }),
    item("off", "flows", { status: "off", definition: daily }),
  ];
  const schedule = mergeSchedule(
    reminderEntries(reminders, MX, NOW, WEEK),
    flowEntries(flows, MX, NOW, WEEK),
    jobEntries(
      [
        { id: "reminders", label: "Reminder sweep", nextRun: NOW + 30_000 },
        { id: "backup", label: "Backup check", nextRun: NOW - 5000 },
      ],
      NOW + 60_000,
      NOW,
    ),
  );
  expect(schedule.slice(0, 5).map((e) => [e.kind, e.label, e.approximate ?? false])).toEqual([
    ["job", "Backup check", false],
    ["job", "Reminder sweep", false],
    ["deploy", "Deploy check", true],
    ["flow", "morning", false],
    ["reminder", "rent", false],
  ]);
  // Fri through Wed at 08:00: the 15th's slot has passed.
  expect(schedule.filter((e) => e.kind === "flow")).toHaveLength(7);
  expect(schedule.find((e) => e.kind === "reminder")?.path).toBe("/r/rent");
  expect(schedule.map((e) => e.at)).toEqual([...schedule.map((e) => e.at)].sort((a, b) => a - b));
  expect(schedule.every((e) => e.at >= NOW && e.at < WEEK)).toBe(true);
});
