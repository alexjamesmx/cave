import type { Database } from "bun:sqlite";
import { FINISHED, RUNS, RUNS_KEPT, type RunStatus } from "../../shared/runs.ts";
import { createChannelWriter } from "../notify/channel-writer.ts";
import type { Store } from "../store.ts";
import { every, type Job } from "./scheduler.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The runs trim (M12 part 5), once a day: Activity keeps the newest `RUNS_KEPT` runs; every
 * older finished run is marked deleted as an ordinary synced write (actor `job:runs-trim`), so
 * devices drop it too. A run still running or waiting is never trimmed. The server's own
 * `flow_runs` and `job_runs` tables keep their newest rows the same way. This is the one place
 * the Cave lets go of records on its own: runs are logs of work, not the owner's data.
 */
export function createRunsTrimJob(store: Store, db: Database, now: () => number): Job {
  const writer = createChannelWriter(store, "runs-trim", now, "job:runs-trim");
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
      const live = store
        .itemsOf(RUNS)
        .filter((d) => d.data._deleted !== true)
        .sort((a, b) =>
          String(b.data.started_at ?? "").localeCompare(String(a.data.started_at ?? "")),
        );
      const old = live
        .slice(RUNS_KEPT)
        .filter((d) => FINISHED.includes(d.data.status as RunStatus));
      for (const doc of old) writer.update(doc, { _deleted: true });
      const before = {
        flows: db.query<{ n: number }, []>("SELECT count(*) AS n FROM flow_runs").get()?.n ?? 0,
        jobs: db.query<{ n: number }, []>("SELECT count(*) AS n FROM job_runs").get()?.n ?? 0,
      };
      trimTable("flow_runs", "key", "started_at");
      trimTable("job_runs", "seq", "seq");
      const rows = Math.max(before.flows - RUNS_KEPT, 0) + Math.max(before.jobs - RUNS_KEPT, 0);
      return {
        result: "ok",
        summary: `${old.length} runs and ${rows} log rows trimmed`,
        didSomething: old.length + rows > 0,
      };
    },
  };
}
