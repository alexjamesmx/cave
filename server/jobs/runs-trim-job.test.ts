import { expect, test } from "bun:test";
import { openDb } from "../db.ts";
import { createRunsTrimJob } from "./runs-trim-job.ts";

const NOW = Date.parse("2026-10-25T12:00:00Z");
const KEPT = 500;

test("keeps the newest flow and job log rows and drops the older ones", async () => {
  const db = openDb(":memory:");
  for (let i = 0; i < KEPT + 5; i++) {
    db.run(
      "INSERT INTO job_runs (job, started_at, finished_at, result, summary) VALUES (?, ?, ?, ?, ?)",
      ["backups", NOW - (KEPT + 5 - i) * 1000, NOW, "ok", ""],
    );
    db.run(
      "INSERT OR IGNORE INTO flow_runs (key, flow_id, started_at, result, log) VALUES (?, ?, ?, ?, ?)",
      [`k${i}`, "flow-rent", NOW - (KEPT + 5 - i) * 1000, "ok", "[]"],
    );
  }

  const job = createRunsTrimJob(db);
  expect(await job.run({ now: NOW })).toMatchObject({
    result: "ok",
    summary: "10 log rows trimmed",
    didSomething: true,
  });
  expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM job_runs").get()?.n).toBe(KEPT);
  expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM flow_runs").get()?.n).toBe(KEPT);
  expect(
    db.query<{ key: string }, []>("SELECT key FROM flow_runs ORDER BY started_at ASC LIMIT 1").get()
      ?.key,
  ).toBe("k5");

  // A second pass finds nothing to do.
  expect(await job.run({ now: NOW })).toMatchObject({
    summary: "0 log rows trimmed",
    didSomething: false,
  });
});
