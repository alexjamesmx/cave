import type { Doc } from "./types.ts";

/**
 * The routine (M12 part 7): the shape of a week, kept in `settings.routine`, no collection and
 * no time grid. Three kinds of block: fixed (days, a start and a length), daily (a length and
 * an optional preferred start) and weekly (a count per week and a length). A block may point
 * at a habit (a checkbox field of `journal`); only those count as done.
 */

export const KINDS = ["fixed", "daily", "weekly"] as const;
export type BlockKind = (typeof KINDS)[number];

export interface RoutineBlock {
  id: string;
  title: string;
  kind: BlockKind;
  minutes: number;
  /** A journal checkbox field id; ticking it on a day is the block done. */
  habit?: string;
  /** Fixed: 0 Monday … 6 Sunday. */
  days?: number[];
  /** `HH:MM`; required for fixed, a preference for daily. */
  start?: string;
  /** Weekly: how many times a week. */
  perWeek?: number;
}

export interface Routine {
  version: 1;
  /** The waking window free time is counted in. */
  day: { start: string; end: string };
  blocks: RoutineBlock[];
}

export const MAX_BLOCKS = 30;
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DEFAULT_ROUTINE: Routine = {
  version: 1,
  day: { start: "07:00", end: "23:00" },
  blocks: [],
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isTime = (v: unknown): v is string => typeof v === "string" && TIME_RE.test(v);
const minutesOfTime = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** `settings.routine` parsed; anything malformed falls back to the empty routine. */
export function routineOf(settings: Record<string, unknown> | undefined): Routine {
  const parsed = parseRoutine(settings?.routine);
  return parsed.ok ? parsed.value : DEFAULT_ROUTINE;
}

/** A stored or typed routine checked field by field; the error names the first problem. */
export function parseRoutine(
  raw: unknown,
): { ok: true; value: Routine } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "not an object" };
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return { ok: false, error: "version must be 1" };
  const day = r.day as Record<string, unknown> | undefined;
  if (
    !day ||
    !isTime(day.start) ||
    !isTime(day.end) ||
    minutesOfTime(day.start) >= minutesOfTime(day.end)
  )
    return { ok: false, error: "day needs a start before an end, HH:MM" };
  if (!Array.isArray(r.blocks)) return { ok: false, error: "blocks must be a list" };
  if (r.blocks.length > MAX_BLOCKS) return { ok: false, error: `at most ${MAX_BLOCKS} blocks` };
  const blocks: RoutineBlock[] = [];
  const ids = new Set<string>();
  for (const b of r.blocks as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") return { ok: false, error: "a block is not an object" };
    if (typeof b.id !== "string" || !b.id || ids.has(b.id))
      return { ok: false, error: "every block needs its own id" };
    ids.add(b.id);
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) return { ok: false, error: `block ${b.id} needs a title` };
    if (!KINDS.includes(b.kind as BlockKind))
      return { ok: false, error: `block ${title}: kind must be fixed, daily or weekly` };
    const minutes = b.minutes;
    if (
      typeof minutes !== "number" ||
      !Number.isInteger(minutes) ||
      minutes < 5 ||
      minutes > 16 * 60
    )
      return { ok: false, error: `block ${title}: minutes must be 5 to 960` };
    const block: RoutineBlock = { id: b.id, title, kind: b.kind as BlockKind, minutes };
    if (b.habit !== undefined) {
      if (typeof b.habit !== "string" || !b.habit)
        return { ok: false, error: `block ${title}: habit must be a field id` };
      block.habit = b.habit;
    }
    if (b.start !== undefined) {
      if (!isTime(b.start)) return { ok: false, error: `block ${title}: start must be HH:MM` };
      block.start = b.start;
    }
    if (block.kind === "fixed") {
      const days = Array.isArray(b.days) ? b.days : [];
      if (days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
        return {
          ok: false,
          error: `block ${title}: a fixed block needs its days (0 Monday to 6 Sunday)`,
        };
      if (!block.start) return { ok: false, error: `block ${title}: a fixed block needs a start` };
      block.days = [...new Set(days as number[])].sort((a, c) => a - c);
    } else if (block.kind === "weekly") {
      if (
        typeof b.perWeek !== "number" ||
        !Number.isInteger(b.perWeek) ||
        b.perWeek < 1 ||
        b.perWeek > 7
      )
        return { ok: false, error: `block ${title}: a weekly block needs 1 to 7 times a week` };
      block.perWeek = b.perWeek;
    }
    blocks.push(block);
  }
  return { ok: true, value: { version: 1, day: { start: day.start, end: day.end }, blocks } };
}

/** 0 Monday … 6 Sunday for a `YYYY-MM-DD`. */
export const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

const shift = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** The seven days of the week `day` is in, Monday first. */
export function weekDays(day: string): string[] {
  const monday = shift(day, -weekdayOf(day));
  return Array.from({ length: 7 }, (_, i) => shift(monday, i));
}

const startMinutes = (b: RoutineBlock) => (b.start ? minutesOfTime(b.start) : undefined);

/** The fixed and daily blocks of a weekday, timed ones first in time order, then by title. */
export function blocksForDay(routine: Routine, weekday: number): RoutineBlock[] {
  return routine.blocks
    .filter((b) => b.kind === "daily" || (b.kind === "fixed" && b.days?.includes(weekday)))
    .sort((a, b) => {
      const sa = startMinutes(a);
      const sb = startMinutes(b);
      if (sa !== undefined && sb !== undefined) return sa - sb;
      if (sa !== undefined) return -1;
      if (sb !== undefined) return 1;
      return a.title.localeCompare(b.title);
    });
}

/** The waking window minus the day's fixed and daily blocks; never below zero. */
export function freeMinutes(routine: Routine, weekday: number): number {
  const window = minutesOfTime(routine.day.end) - minutesOfTime(routine.day.start);
  const used = blocksForDay(routine, weekday).reduce((t, b) => t + b.minutes, 0);
  return Math.max(window - used, 0);
}

/** The end time of a timed block, `HH:MM`. */
export function endOf(block: RoutineBlock): string | undefined {
  if (!block.start) return undefined;
  const m = minutesOfTime(block.start) + block.minutes;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Whether a block was done on a day: its habit ticked on that day's entry. */
export const isBlockDone = (block: RoutineBlock, entry: Doc | undefined) =>
  block.habit !== undefined && entry?.data[block.habit] === true;

/** For each weekly block with a habit, the days of `days` on which it was done. */
export function weeklyCounts(
  routine: Routine,
  entries: Map<string, Doc>,
  days: string[],
): { block: RoutineBlock; done: number; of: number }[] {
  return routine.blocks
    .filter((b) => b.kind === "weekly")
    .map((block) => ({
      block,
      done: block.habit ? days.filter((d) => isBlockDone(block, entries.get(d))).length : 0,
      of: block.perWeek ?? 0,
    }));
}

/** `3h 30m`, `45m`. */
export const duration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;

export const withBlock = (routine: Routine, block: RoutineBlock): Routine => ({
  ...routine,
  blocks: routine.blocks.some((b) => b.id === block.id)
    ? routine.blocks.map((b) => (b.id === block.id ? block : b))
    : [...routine.blocks, block],
});

export const withoutBlock = (routine: Routine, id: string): Routine => ({
  ...routine,
  blocks: routine.blocks.filter((b) => b.id !== id),
});
