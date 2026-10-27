import { expect, test } from "bun:test";
import {
  blocksForDay,
  DEFAULT_ROUTINE,
  duration,
  endOf,
  minutesByArea,
  parseRoutine,
  type Routine,
  routineOf,
  weekdayOf,
  weeklyMinutes,
  withBlock,
  withoutBlock,
} from "./routine.ts";

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
    { id: "lc", title: "LeetCode", kind: "daily", minutes: 60, start: "19:30", area: "learn" },
    { id: "zh", title: "Chinese", kind: "daily", minutes: 30, area: "learn" },
    { id: "gym", title: "Gym", kind: "weekly", minutes: 75, perWeek: 2, area: "body" },
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
  expect(bad({ area: "work" })).toMatchObject({
    ok: false,
    error: "block Work: area must be body, learn, rest, fun, other",
  });
});

test("a habit link stored before areas is dropped, the block kept", () => {
  const gym = routine.blocks[3] as Routine["blocks"][number];
  const old = { ...routine, blocks: [{ ...gym, habit: "gym" }] };
  expect(parseRoutine(old)).toEqual({
    ok: true,
    value: { ...routine, blocks: [gym] },
  });
});

test("a day's blocks: fixed ones on their days plus the daily ones, timed first", () => {
  // 2026-10-26 is a Monday.
  expect(weekdayOf("2026-10-26")).toBe(0);
  expect(weekdayOf("2026-10-31")).toBe(5);
  expect(blocksForDay(routine, 0).map((b) => b.id)).toEqual(["work", "lc", "zh"]);
  expect(blocksForDay(routine, 5).map((b) => b.id)).toEqual(["shop", "lc", "zh"]);
  expect(blocksForDay(routine, 6).map((b) => b.id)).toEqual(["lc", "zh"]);
  expect(endOf(routine.blocks[0] as (typeof routine.blocks)[number])).toBe("18:00");
  expect(duration(90)).toBe("1h 30m");
  expect(duration(45)).toBe("45m");
  expect(duration(120)).toBe("2h");
});

test("a week's minutes per area: fixed by its days, weekly by its count, daily by seven", () => {
  const [work, lc, , gym] = routine.blocks as Routine["blocks"];
  expect(weeklyMinutes(work as Routine["blocks"][number])).toBe(540 * 5);
  expect(weeklyMinutes(lc as Routine["blocks"][number])).toBe(60 * 7);
  expect(weeklyMinutes(gym as Routine["blocks"][number])).toBe(75 * 2);
  expect(minutesByArea(routine)).toEqual([
    { area: "body", minutes: 150 },
    { area: "learn", minutes: 630 },
    { area: "other", minutes: 2700 + 60 },
  ]);
  const plan = withBlock(routine, {
    id: "run",
    title: "Run",
    kind: "weekly",
    minutes: 30,
    perWeek: 3,
  });
  expect(plan.blocks).toHaveLength(6);
  expect(withoutBlock(plan, "run").blocks).toHaveLength(5);
  expect(
    withBlock(plan, { ...(plan.blocks[3] as Routine["blocks"][number]), perWeek: 3 }).blocks[3]
      ?.perWeek,
  ).toBe(3);
});
