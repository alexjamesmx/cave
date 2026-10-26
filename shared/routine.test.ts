import { expect, test } from "bun:test";
import {
  blocksForDay,
  DEFAULT_ROUTINE,
  duration,
  endOf,
  parseRoutine,
  type Routine,
  routineOf,
  weekDays,
  weekdayOf,
  weeklyCounts,
  withBlock,
  withoutBlock,
} from "./routine.ts";
import type { Doc } from "./types.ts";

const routine: Routine = {
  version: 1,
  day: { start: "07:00", end: "23:00" },
  blocks: [
    {
      id: "work",
      title: "Work",
      kind: "fixed",
      minutes: 540,
      days: [0, 1, 2, 3, 4],
      start: "09:00",
    },
    { id: "lc", title: "LeetCode", kind: "daily", minutes: 60, start: "19:30", habit: "leetcode" },
    { id: "zh", title: "Chinese", kind: "daily", minutes: 30, habit: "chinese" },
    { id: "gym", title: "Gym", kind: "weekly", minutes: 75, perWeek: 2, habit: "gym" },
    { id: "shop", title: "Shopping", kind: "fixed", minutes: 60, days: [5], start: "11:00" },
  ],
};

test("the setting is checked field by field and falls back to the empty routine", () => {
  expect(routineOf(undefined)).toBe(DEFAULT_ROUTINE);
  expect(routineOf({ routine: { version: 2 } })).toBe(DEFAULT_ROUTINE);
  expect(parseRoutine(routine)).toEqual({ ok: true, value: routine });
  const bad = (patch: Record<string, unknown>) =>
    parseRoutine({ ...routine, blocks: [{ ...routine.blocks[0], ...patch }] });
  expect(bad({ minutes: 2 })).toMatchObject({
    ok: false,
    error: "block Work: minutes must be 5 to 960",
  });
  expect(bad({ days: [] })).toMatchObject({ ok: false });
  expect(bad({ start: "9am" })).toMatchObject({
    ok: false,
    error: "block Work: start must be HH:MM",
  });
  expect(parseRoutine({ ...routine, day: { start: "23:00", end: "07:00" } })).toMatchObject({
    ok: false,
  });
  expect(
    parseRoutine({ ...routine, blocks: [{ id: "g", title: "Gym", kind: "weekly", minutes: 60 }] }),
  ).toMatchObject({ ok: false, error: "block Gym: a weekly block needs 1 to 7 times a week" });
});

test("a day's blocks: fixed ones on their days plus the daily ones, timed first", () => {
  // 2026-10-26 is a Monday.
  expect(weekdayOf("2026-10-26")).toBe(0);
  expect(weekdayOf("2026-10-31")).toBe(5);
  expect(weekDays("2026-10-28")).toEqual([
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
  expect(blocksForDay(routine, 0).map((b) => b.id)).toEqual(["work", "lc", "zh"]);
  expect(blocksForDay(routine, 5).map((b) => b.id)).toEqual(["shop", "lc", "zh"]);
  expect(blocksForDay(routine, 6).map((b) => b.id)).toEqual(["lc", "zh"]);
  expect(endOf(routine.blocks[0] as (typeof routine.blocks)[number])).toBe("18:00");
  expect(duration(90)).toBe("1h 30m");
  expect(duration(45)).toBe("45m");
  expect(duration(120)).toBe("2h");
});

test("weekly counters come from the habit's ticks in the week; blocks without a habit never count", () => {
  const entry = (day: string, data: Record<string, unknown>): [string, Doc] => [
    day,
    { id: day, kind: "item", collection: "journal", data, stamps: {}, actor: "" },
  ];
  const entries = new Map([
    entry("2026-10-26", { gym: true, leetcode: true }),
    entry("2026-10-28", { gym: true }),
    entry("2026-10-30", { gym: false }),
  ]);
  const week = weekDays("2026-10-26");
  expect(weeklyCounts(routine, entries, week)).toEqual([
    { block: expect.objectContaining({ id: "gym" }), done: 2, of: 2 },
  ]);
  const plan = withBlock(routine, {
    id: "run",
    title: "Run",
    kind: "weekly",
    minutes: 30,
    perWeek: 3,
  });
  expect(weeklyCounts(plan, entries, week).map((c) => [c.block.id, c.done, c.of])).toEqual([
    ["gym", 2, 2],
    ["run", 0, 3],
  ]);
  expect(withoutBlock(plan, "run").blocks).toHaveLength(5);
  expect(
    withBlock(plan, { ...(plan.blocks[3] as (typeof plan.blocks)[number]), perWeek: 3 }).blocks[3]
      ?.perWeek,
  ).toBe(3);
});
