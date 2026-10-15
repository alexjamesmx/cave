import { expect, test } from "bun:test";
import { openDb } from "../db.ts";
import { createScheduler, every, type Job, type JobOutcome } from "./scheduler.ts";

function job(
  id: string,
  ms: number,
  run: () => Promise<JobOutcome> | JobOutcome,
): Job & { runs: number } {
  const j = {
    id,
    label: id,
    runs: 0,
    describeSchedule: () => `every ${ms / 1000}s`,
    nextRun: every(ms),
    async run() {
      j.runs += 1;
      return run();
    },
  };
  return j;
}

const quiet: JobOutcome = { result: "ok", summary: "nothing due", didSomething: false };
const busy: JobOutcome = { result: "ok", summary: "2 sent, 0 missed", didSomething: true };

test("due jobs run in order; each waits for its own interval", async () => {
  let now = 0;
  const db = openDb(":memory:");
  const fast = job("reminders", 30_000, () => quiet);
  const slow = job("backups", 3_600_000, () => quiet);
  const scheduler = createScheduler({ jobs: [fast, slow], db, now: () => now, log: () => {} });
  await scheduler.tick();
  expect([fast.runs, slow.runs]).toEqual([1, 1]);
  now = 30_000;
  await scheduler.tick();
  expect([fast.runs, slow.runs]).toEqual([2, 1]);
  now = 3_600_000;
  await scheduler.tick();
  expect([fast.runs, slow.runs]).toEqual([3, 2]);
  expect(scheduler.status().map((s) => [s.id, s.lastRun, s.nextRun, s.lastResult])).toEqual([
    ["reminders", 3_600_000, 3_630_000, "ok"],
    ["backups", 3_600_000, 7_200_000, "ok"],
  ]);
});

test("a failing job doesn't stop the others, and only runs that did something are recorded", async () => {
  const db = openDb(":memory:");
  const broken = job("telegram", 30_000, () => {
    throw new TypeError("network down");
  });
  const quietJob = job("flows", 30_000, () => quiet);
  const busyJob = job("reminders", 30_000, () => busy);
  const scheduler = createScheduler({
    jobs: [broken, quietJob, busyJob],
    db,
    now: () => 5,
    log: () => {},
  });
  await scheduler.tick();
  expect([broken.runs, quietJob.runs, busyJob.runs]).toEqual([1, 1, 1]);
  const rows = db
    .query<{ job: string; result: string; summary: string }, []>(
      "SELECT job, result, summary FROM job_runs ORDER BY seq",
    )
    .all();
  expect(rows).toEqual([
    { job: "telegram", result: "failed", summary: "TypeError" },
    { job: "reminders", result: "ok", summary: "2 sent, 0 missed" },
  ]);
});

test("a tick that is still running is not entered twice", async () => {
  const db = openDb(":memory:");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const slow = job("telegram", 0, async () => {
    await gate;
    return quiet;
  });
  const scheduler = createScheduler({ jobs: [slow], db, now: () => 0, log: () => {} });
  const first = scheduler.tick();
  await scheduler.tick();
  release();
  await first;
  expect(slow.runs).toBe(1);
});
