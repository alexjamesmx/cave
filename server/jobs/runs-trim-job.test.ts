import { expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import { RUNS, RUNS_KEPT } from "../../shared/runs.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createStore } from "../store.ts";
import { createRunsTrimJob } from "./runs-trim-job.ts";

const NOW = Date.parse("2026-10-25T12:00:00Z");

test("keeps the newest runs and every unfinished one; older finished runs are marked deleted as synced writes", async () => {
  const db = openDb(":memory:");
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  const docs: Doc[] = [];
  const total = RUNS_KEPT + 20;
  for (let i = 0; i < total; i++) {
    const startedAt = new Date(NOW - (total - i) * 60_000).toISOString();
    // The three oldest stay unfinished: still running or waiting on the owner.
    const status = i === 0 ? "running" : i === 1 ? "waiting" : i === 2 ? "queued" : "done";
    const data = {
      project: "proj-cave",
      agent: "claude",
      status,
      started_at: startedAt,
      steps: [],
    };
    docs.push({
      id: `run-${String(i).padStart(4, "0")}`,
      kind: "item",
      collection: RUNS,
      data,
      stamps: Object.fromEntries(
        Object.keys(data).map((k) => [k, formatStamp(NOW - 1000, i + 1, "test")]),
      ),
      actor: "agent:claude",
    });
  }
  store.applyChanges(docs, "agent:claude", NOW - 1000);
  for (let i = 0; i < RUNS_KEPT + 5; i++) {
    db.run(
      "INSERT INTO job_runs (job, started_at, finished_at, result, summary) VALUES (?, ?, ?, ?, ?)",
      ["backups", NOW - (RUNS_KEPT + 5 - i) * 1000, NOW, "ok", ""],
    );
    db.run(
      "INSERT OR IGNORE INTO flow_runs (key, flow_id, started_at, result, log) VALUES (?, ?, ?, ?, ?)",
      [`k${i}`, "flow-rent", NOW - (RUNS_KEPT + 5 - i) * 1000, "ok", "[]"],
    );
  }

  const job = createRunsTrimJob(store, db, () => NOW);
  const outcome = await job.run({ now: NOW });
  // 20 beyond the cap, minus the 3 unfinished ones among the oldest.
  expect(outcome).toMatchObject({
    result: "ok",
    summary: "17 runs and 10 log rows trimmed",
    didSomething: true,
  });
  const live = store.itemsOf(RUNS).filter((d) => d.data._deleted !== true);
  expect(live).toHaveLength(RUNS_KEPT + 3);
  expect(live.map((d) => d.id)).toContain("run-0000");
  expect(live.map((d) => d.id)).toContain("run-0002");
  expect(live.map((d) => d.id)).not.toContain("run-0003");
  expect(store.get("run-0003")).toMatchObject({ data: { _deleted: true }, actor: "job:runs-trim" });
  expect(store.changesFor("run-0003", 5).map((c) => c.actor)).toContain("job:runs-trim");
  expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM job_runs").get()?.n).toBe(
    RUNS_KEPT,
  );
  expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM flow_runs").get()?.n).toBe(
    RUNS_KEPT,
  );
  expect(
    db.query<{ key: string }, []>("SELECT key FROM flow_runs ORDER BY started_at ASC LIMIT 1").get()
      ?.key,
  ).toBe("k5");

  // A second pass finds nothing to do.
  expect(await job.run({ now: NOW })).toMatchObject({
    summary: "0 runs and 0 log rows trimmed",
    didSomething: false,
  });
});
