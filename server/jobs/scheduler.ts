import type { Database } from "bun:sqlite";

export interface JobOutcome {
  result: "ok" | "failed" | "skipped";
  /** One line, no personal data: "2 sent, 0 missed". */
  summary: string;
  /** Only runs that did something are recorded: a sweep that found nothing is not a run. */
  didSomething: boolean;
}

/**
 * A server job: reminders, Telegram's poll, backups; flows in Part C. `nextRun` gets the
 * start of the last run (undefined before the first) and says when the next is due.
 */
export interface Job {
  id: string;
  label: string;
  describeSchedule(): string;
  nextRun(lastStart: number | undefined): number;
  run(ctx: { now: number }): Promise<JobOutcome>;
}

/** Due at start-up, then every `ms` after the last run started. */
export const every =
  (ms: number) =>
  (lastStart: number | undefined): number =>
    lastStart === undefined ? 0 : lastStart + ms;

export interface JobState {
  id: string;
  label: string;
  schedule: string;
  lastRun: number | undefined;
  nextRun: number;
  lastResult: JobOutcome["result"] | undefined;
  lastSummary: string | undefined;
}

export interface SchedulerOptions {
  jobs: Job[];
  db: Database;
  now: () => number;
  intervalMs?: number;
  log?: (line: string) => void;
}

export function createScheduler({
  jobs,
  db,
  now,
  intervalMs = 30_000,
  log = console.log,
}: SchedulerOptions) {
  const state = new Map<string, { start?: number; outcome?: JobOutcome }>();
  const record = db.query<void, [string, number, number, string, string]>(
    "INSERT INTO job_runs (job, started_at, finished_at, result, summary) VALUES (?, ?, ?, ?, ?)",
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  /** Runs every job that is due, one at a time; one failing never stops the others. */
  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (const job of jobs) {
        const last = state.get(job.id)?.start;
        const start = now();
        if (job.nextRun(last) > start) continue;
        let outcome: JobOutcome;
        try {
          outcome = await job.run({ now: start });
        } catch (error) {
          outcome = { result: "failed", summary: (error as Error).name, didSomething: true };
        }
        state.set(job.id, { start, outcome });
        if (outcome.didSomething || outcome.result === "failed") {
          record.run(job.id, start, now(), outcome.result, outcome.summary);
          log(`job ${job.id}: ${outcome.result}, ${outcome.summary}`);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      // Each tick is scheduled after the last one ended, so a slow job never overlaps itself.
      const loop = async () => {
        await tick();
        timer = setTimeout(loop, intervalMs);
      };
      void loop();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
    status(): JobState[] {
      return jobs.map((job) => {
        const s = state.get(job.id);
        return {
          id: job.id,
          label: job.label,
          schedule: job.describeSchedule(),
          lastRun: s?.start,
          nextRun: job.nextRun(s?.start),
          lastResult: s?.outcome?.result,
          lastSummary: s?.outcome?.summary,
        };
      });
    },
  };
}
export type Scheduler = ReturnType<typeof createScheduler>;
