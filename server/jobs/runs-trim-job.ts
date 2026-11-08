import type { Database } from "bun:sqlite";
import { every, type Job } from "./scheduler.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows kept in each log table; older ones are dropped. */
const RUNS_KEPT = 500;

/**
 * The runs trim (M12 part 5), once a day: the server's own `flow_runs` and `job_runs` tables
 * keep their newest `RUNS_KEPT` rows, so the logs behind Flows → Runs never grow without limit.
 * This is the one place the Cave lets go of records on its own: they are logs of work, not the
 * owner's data. (It also trimmed agents' runs until Projects was retired on 2026-11-08.)
 */
export function createRunsTrimJob(db: Database): Job {
  const trimTable = (table: string, key: string, order: string) =>
    db.run(
      `DELETE FROM ${table} WHERE ${key} NOT IN (SELECT ${key} FROM ${table} ORDER BY ${order} DESC LIMIT ?)`,
      [RUNS_KEPT],
    );
  return {
    id: "runs-trim",
    label: "Runs trim",
    describeSchedule: () => `every day, keeps the newest ${RUNS_KEPT}`,
    nextRun: every(DAY_MS),
    async run() {
      const before = {
        flows: db.query<{ n: number }, []>("SELECT count(*) AS n FROM flow_runs").get()?.n ?? 0,
        jobs: db.query<{ n: number }, []>("SELECT count(*) AS n FROM job_runs").get()?.n ?? 0,
      };
      trimTable("flow_runs", "key", "started_at");
      trimTable("job_runs", "seq", "seq");
      const rows = Math.max(before.flows - RUNS_KEPT, 0) + Math.max(before.jobs - RUNS_KEPT, 0);
      return { result: "ok", summary: `${rows} log rows trimmed`, didSomething: rows > 0 };
    },
  };
}
