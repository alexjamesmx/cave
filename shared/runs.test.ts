import { expect, test } from "bun:test";
import { validateFields } from "./fields.ts";
import {
  flowRunEntry,
  isActiveRun,
  jobRunEntry,
  parseSteps,
  RUNS_COLLECTION,
  runEntry,
  runsMigration,
  STEP_LIMITS,
} from "./runs.ts";
import type { Doc } from "./types.ts";

const step = (over: Record<string, unknown> = {}) => ({
  title: "Tests written",
  status: "done",
  at: "2026-10-17T03:00:00.000Z",
  ...over,
});

test("steps: plain text, known statuses, a time each, at most 200", () => {
  expect(parseSteps([step(), step({ status: "running", detail: "42 of 50" })]).ok).toBe(true);
  const error = (v: unknown) => {
    const p = parseSteps(v);
    return p.ok ? "ok" : p.error;
  };
  expect(error("x")).toBe("must be a list of steps");
  expect(error([step({ status: "maybe" })])).toContain("status must be one of");
  expect(error([step({ title: "" })])).toContain("needs a title");
  expect(error([step({ at: "yesterday" })])).toBe("step 1 needs an ISO time");
  expect(error([step({ detail: "<img src=x>" })])).toBe("step 1 must be plain text, not HTML");
  expect(error(Array.from({ length: STEP_LIMITS.steps + 1 }, () => step()))).toContain("more than");
  const steps = RUNS_COLLECTION.fields.find((f) => f.id === "steps");
  if (!steps) throw new Error("no steps field");
  expect(validateFields([steps], { steps: [step({ status: "nope" })] })[0]?.error).toContain(
    "are not valid steps",
  );
});

test("an agent's run, a flow run and a job run read the same way in Activity", () => {
  const run: Doc = {
    id: "r1",
    kind: "item",
    collection: "runs",
    data: {
      _title: "Build part 4",
      agent: "claude",
      status: "running",
      project: "proj-cave",
      part: "part-cave-m8",
      started_at: "2026-10-16T21:00",
      steps: [step()],
    },
    stamps: {},
    actor: "agent:claude",
  };
  const entry = runEntry(run, () => 1000);
  expect(entry).toMatchObject({
    source: "agent",
    by: "claude",
    status: "running",
    startedAt: 1000,
    project: "proj-cave",
    part: "part-cave-m8",
  });
  expect(entry.steps).toEqual([
    { title: "Tests written", status: "done", at: Date.parse(step().at) },
  ]);
  expect(isActiveRun(entry)).toBe(true);

  const flow = flowRunEntry(
    {
      key: "k1",
      flowId: "flow-rent",
      startedAt: 5,
      result: "ok",
      steps: [{ step: 1, type: "create", outcome: "created 1" }],
    },
    "Rent day",
  );
  expect(flow).toMatchObject({ id: "flow:k1", source: "flow", title: "Rent day", status: "done" });
  expect(flow.steps).toEqual([{ title: "1. create", status: "done", detail: "created 1" }]);
  expect(
    flowRunEntry({ key: "k2", flowId: "f", startedAt: 1, result: "missed", steps: [] }, "x").status,
  ).toBe("skipped");

  const job = jobRunEntry({
    job: "backup",
    startedAt: 7,
    finishedAt: 9,
    result: "error",
    summary: "disk full",
  });
  expect(job).toMatchObject({ source: "job", status: "failed", finishedAt: 9 });
  expect(isActiveRun(job)).toBe(false);
});

test("seed migration 13 adds the hidden runs collection once", () => {
  const [out] = runsMigration(() => undefined);
  expect(out).toMatchObject({ id: "runs", kind: "collection", data: { hidden: true } });
  expect(runsMigration(() => ({ id: "runs" }) as Doc)).toEqual([]);
});
