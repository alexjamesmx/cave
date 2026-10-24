import { expect, test } from "bun:test";
import { formatStamp } from "./hlc.ts";
import {
  activityThisWeek,
  agentOnIt,
  answeredQuestions,
  openQuestions,
  type ProjectDocs,
  progressOf,
  stateOf,
  summarize,
  summaryLine,
} from "./project-status.ts";
import type { Doc } from "./types.ts";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const TODAY = "2026-10-24";
const DAY = 24 * 60 * 60 * 1000;

const doc = (
  id: string,
  collection: string,
  data: Record<string, unknown>,
  stampedAt = NOW - 2 * DAY,
): Doc => ({
  id,
  kind: "item",
  collection,
  data,
  stamps: Object.fromEntries(Object.keys(data).map((k) => [k, formatStamp(stampedAt, 0, "t")])),
  actor: "user:t",
});

const project = (data: Record<string, unknown> = {}) =>
  doc("p", "projects", {
    _title: "P",
    status: "active",
    _created: "2026-10-01T00:00:00Z",
    ...data,
  });
const part = (id: string, data: Record<string, unknown>) =>
  doc(id, "parts", { project: "p", _created: "2026-10-01T00:00:00Z", ...data });
const task = (id: string, data: Record<string, unknown>, at?: number) =>
  doc(id, "tasks", { project: "p", ...data }, at);
const docs = (over: Partial<ProjectDocs> = {}): ProjectDocs => ({
  project: project(),
  parts: [],
  tasks: [],
  runs: [],
  ...over,
});

test("the project's own status wins: done, dropped and paused", () => {
  for (const status of ["done", "dropped", "paused"] as const)
    expect(
      stateOf(
        docs({ project: project({ status }), parts: [part("a", { status: "blocked" })] }),
        TODAY,
        NOW,
      ),
    ).toBe(status);
});

test("a blocked live part blocks the project; a deleted one does not", () => {
  expect(stateOf(docs({ parts: [part("a", { status: "blocked" })] }), TODAY, NOW)).toBe("blocked");
  expect(
    stateOf(docs({ parts: [part("a", { status: "blocked", _deleted: true })] }), TODAY, NOW),
  ).toBe("on-track");
});

test("an open question from an agent means waiting on you; an answered one does not", () => {
  const open = task("q1", { _title: "Answer: which DB?", status: "todo", _askedBy: "claude" });
  const done = task("q2", { _title: "Answer: name?", status: "done", _askedBy: "claude" });
  expect(stateOf(docs({ tasks: [open] }), TODAY, NOW)).toBe("waiting");
  expect(stateOf(docs({ tasks: [done] }), TODAY, NOW)).toBe("on-track");
  // Blocked comes first.
  expect(
    stateOf(docs({ tasks: [open], parts: [part("a", { status: "blocked" })] }), TODAY, NOW),
  ).toBe("blocked");
  expect(openQuestions([open, done]).map((t) => t.id)).toEqual(["q1"]);
  expect(answeredQuestions([open, done], NOW).map((t) => t.id)).toEqual(["q2"]);
  expect(
    answeredQuestions([task("q3", { status: "done", _askedBy: "x" }, NOW - 40 * DAY)], NOW),
  ).toEqual([]);
});

test("slipping: a past review date, an overdue part, or progress behind the schedule", () => {
  expect(stateOf(docs({ project: project({ review: "2026-10-20" }) }), TODAY, NOW)).toBe(
    "slipping",
  );
  expect(stateOf(docs({ project: project({ review: "2026-10-30" }) }), TODAY, NOW)).toBe(
    "on-track",
  );
  expect(
    stateOf(docs({ parts: [part("a", { status: "active", due: "2026-10-23" })] }), TODAY, NOW),
  ).toBe("slipping");
  expect(
    stateOf(docs({ parts: [part("a", { status: "done", due: "2026-10-23" })] }), TODAY, NOW),
  ).toBe("on-track");
  // Four parts due in a month from Oct 1: on Oct 24 about 76% of the time is gone, 1 of 4
  // done (25%) is behind by more than 15%; 3 of 4 (75%) is within the margin.
  const parts = (done: number) =>
    [1, 2, 3, 4].map((i) =>
      part(`p${i}`, { status: i <= done ? "done" : "planned", due: "2026-10-31" }),
    );
  expect(stateOf(docs({ parts: parts(1) }), TODAY, NOW)).toBe("slipping");
  expect(stateOf(docs({ parts: parts(3) }), TODAY, NOW)).toBe("on-track");
  // No due date: no schedule to slip against.
  expect(stateOf(docs({ parts: [part("a", { status: "planned" })] }), TODAY, NOW)).toBe("on-track");
});

test("progress: the template's rule, else parts, else tasks, else nothing", () => {
  const leet = [
    doc("l1", "leetcode", { project: "p", status: "solved" }),
    doc("l2", "leetcode", { project: "p", status: "todo" }),
  ];
  const rule = { collection: "leetcode", field: "status", done: ["solved"] };
  expect(progressOf(docs(), rule, (c) => (c === "leetcode" ? leet : []))).toEqual({
    done: 1,
    total: 2,
    of: "leetcode",
  });
  expect(
    progressOf(
      docs({ parts: [part("a", { status: "done" }), part("b", { status: "planned" })] }),
      undefined,
      () => [],
    ),
  ).toEqual({ done: 1, total: 2, of: "parts" });
  expect(
    progressOf(
      docs({
        tasks: [
          task("t1", { status: "done" }),
          task("t2", { status: "todo" }),
          task("q", { status: "todo", _askedBy: "claude" }),
        ],
      }),
      undefined,
      () => [],
    ),
  ).toEqual({ done: 1, total: 2, of: "tasks" });
  expect(progressOf(docs(), undefined, () => [])).toBeUndefined();
});

test("activity counts docs stamped in the last 7 days; an agent is on it while a run is fresh", () => {
  const d = docs({
    tasks: [
      task("t1", { status: "todo" }, NOW - DAY),
      task("t2", { status: "todo" }, NOW - 9 * DAY),
    ],
    others: [doc("n1", "notes", { project: "p" }, NOW - 6 * DAY)],
  });
  expect(activityThisWeek(d, NOW)).toBe(2);
  const run = (status: string, at: number) =>
    doc("r", "runs", { project: "p", status, started_at: "2026-10-24T10:00" }, at);
  expect(agentOnIt([run("running", NOW - 3600_000)], NOW)).toBe(true);
  expect(agentOnIt([run("running", NOW - 2 * DAY)], NOW)).toBe(false);
  expect(agentOnIt([run("done", NOW - 3600_000)], NOW)).toBe(false);
});

test("the summary line reads as the Scene prints it", () => {
  const d = docs({
    parts: [part("a", { status: "done" }), part("b", { status: "planned" })],
    runs: [doc("r", "runs", { project: "p", status: "running" }, NOW - 1000)],
    tasks: [task("q", { status: "todo", _askedBy: "claude" })],
  });
  const s = summarize(d, undefined, () => [], TODAY, NOW);
  expect(s.state).toBe("waiting");
  expect(summaryLine(s)).toBe("50% · waiting on you · agent working · 1 question");
  expect(summaryLine(summarize(docs(), undefined, () => [], TODAY, NOW))).toBe("on track");
});
