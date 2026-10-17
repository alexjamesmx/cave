import { beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FlowDefinition } from "../../shared/flows/registry.ts";
import { formatStamp } from "../../shared/hlc.ts";
import type { Zone } from "../../shared/reminders.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import type { Notifier } from "../notify/notifier.ts";
import type { Notification } from "../notify/types.ts";
import { createStore, type Store } from "../store.ts";
import { createFlowEngine, type FlowEngine } from "./engine.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
// 2026-10-15 10:00 in Mexico City.
const NOW = Date.parse("2026-10-15T16:00:00Z");

let store: Store;
let engine: FlowEngine;
let notified: Notification[];
let ready: boolean;
let clock: number;
let tick = 1;

const notifier: Notifier = {
  statuses: () => [{ id: "webpush", label: "Web Push", status: { ready, summary: "" } }],
  async notify(n) {
    notified.push(n);
    return { delivered: 1, failed: 0 };
  },
};

beforeEach(() => {
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  notified = [];
  ready = true;
  clock = NOW;
  engine = createFlowEngine({
    store,
    db,
    notifier,
    now: () => clock,
    zone: () => MX,
    log: () => {},
  });
});

function write(id: string, collection: string, data: Record<string, unknown>, at = clock) {
  const stamp = formatStamp(at, tick++, "test");
  const doc: Doc = {
    id,
    kind: "item",
    collection,
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "owner",
  };
  store.applyChanges([doc], "owner", at);
}

const flow = (id: string, definition: FlowDefinition, at = clock) =>
  write(id, "flows", { _title: id, status: "on", definition }, at);

const salary: FlowDefinition = {
  version: 1,
  trigger: {
    type: "item-added",
    collection: "money",
    where: [{ field: "direction", op: "=", value: "income" }],
  },
  steps: [
    { type: "if", all: [{ field: "amount", op: ">=", value: 15000 }] },
    { type: "create", collection: "tasks", title: "Move {{item.amount|pct:20}} to invest" },
  ],
};

const rent: FlowDefinition = {
  version: 1,
  trigger: { type: "schedule", every: "month", day: 15, at: "09:00" },
  steps: [
    { type: "create", collection: "tasks", title: "Pay rent", fields: { priority: "high" } },
    { type: "notify", title: "Pay rent", open: "created-item" },
  ],
};

const tasks = () => store.itemsOf("tasks");

test("an item trigger runs once per change, writes as the flow, and checks its conditions", async () => {
  flow("f-salary", salary);
  write("pay", "money", { _title: "Salary", direction: "income", amount: 20000 });
  write("small", "money", { _title: "Refund", direction: "income", amount: 100 });
  write("rent", "money", { _title: "Rent", direction: "expense", amount: 20000 });
  await engine.settled();

  expect(tasks().map((t) => t.data._title)).toEqual(["Move 4000 to invest"]);
  const created = tasks()[0] as Doc;
  expect(store.changesFor(created.id, 1)[0]?.actor).toBe("flow:f-salary");
  expect(engine.runs("f-salary").map((r) => r.result)).toEqual(["stopped", "ok"]);
  // Activity reads every flow's runs at once, newest first, with their steps.
  const recent = engine.recent(10);
  expect(recent.map((r) => r.flowId)).toEqual(["f-salary", "f-salary"]);
  expect(recent[0]?.startedAt).toBeGreaterThanOrEqual(recent[1]?.startedAt ?? 0);
  expect(recent.some((r) => r.steps.length > 0)).toBe(true);

  // Editing the income later is not "added" again.
  write("pay", "money", { amount: 30000 });
  await engine.settled();
  expect(tasks()).toHaveLength(1);
});

test("a flow's own writes never trigger flows", async () => {
  flow("f-echo", {
    version: 1,
    trigger: { type: "item-added", collection: "tasks" },
    steps: [{ type: "create", collection: "tasks", title: "Echo of {{item.title}}" }],
  });
  write("t1", "tasks", { _title: "Start" });
  await engine.settled();
  expect(
    tasks()
      .map((t) => t.data._title)
      .sort(),
  ).toEqual(["Echo of Start", "Start"]);
});

test("item-changed fires only when the field changes to the value asked for", async () => {
  flow("f-done", {
    version: 1,
    trigger: { type: "item-changed", collection: "tasks", field: "status", to: "done" },
    steps: [{ type: "update-trigger-item", fields: { priority: "low" } }],
  });
  write("t1", "tasks", { _title: "Ship", status: "doing", priority: "high" });
  write("t1", "tasks", { _title: "Ship it" });
  await engine.settled();
  expect(store.get("t1")?.data.priority).toBe("high");

  write("t1", "tasks", { status: "done" });
  await engine.settled();
  expect(store.get("t1")?.data.priority).toBe("low");
  expect(engine.runs("f-done")).toHaveLength(1);
});

test("a draft or off flow doesn't run", async () => {
  write("f-off", "flows", { _title: "off", status: "off", definition: salary });
  write("f-draft", "flows", { _title: "draft", status: "draft", definition: salary });
  write("pay", "money", { direction: "income", amount: 20000 });
  await engine.settled();
  expect(tasks()).toHaveLength(0);
});

test("a schedule runs its slot once, after it was turned on, and records a late one as missed", async () => {
  // Turned on before the 15th at 09:00; the job runs at 10:00.
  flow("f-rent", rent, Date.parse("2026-10-01T12:00:00Z"));
  expect(await engine.job.run({ now: NOW })).toMatchObject({ summary: "1 ran, 0 missed" });
  expect(await engine.job.run({ now: NOW + 30_000 })).toMatchObject({ didSomething: false });
  expect(tasks().map((t) => [t.data._title, t.data.priority])).toEqual([["Pay rent", "high"]]);
  expect(notified).toMatchObject([{ kind: "message", title: "Pay rent", path: "/c/tasks" }]);

  flow("f-late", rent, Date.parse("2026-10-01T12:00:00Z"));
  expect(await engine.job.run({ now: NOW + 7 * 3600_000 })).toMatchObject({
    summary: "0 ran, 1 missed",
  });
  expect(engine.runs("f-late")[0]?.result).toBe("missed");
});

test("turning a flow on after today's slot waits for the next one", async () => {
  flow("f-rent", rent, NOW - 1000);
  expect(await engine.job.run({ now: NOW })).toMatchObject({ didSomething: false });
});

test("notify is skipped when no channel is ready, and more than 3 notifications fail the run", async () => {
  ready = false;
  flow("f-rent", rent, Date.parse("2026-10-01T12:00:00Z"));
  await engine.job.run({ now: NOW });
  expect(notified).toHaveLength(0);
  expect(engine.runs("f-rent")[0]?.steps[1]?.outcome).toBe("notify skipped: push off");

  ready = true;
  const note = { type: "notify", title: "Hi", open: "calendar" } as const;
  flow("f-loud", { ...rent, steps: [note, note, note, note] }, Date.parse("2026-10-01T12:00:00Z"));
  await engine.job.run({ now: NOW });
  expect(notified).toHaveLength(3);
  expect(engine.runs("f-loud")[0]?.result).toBe("failed");
});

test("a write the fields refuse fails the run and writes nothing", async () => {
  flow("f-bad", {
    version: 1,
    trigger: { type: "item-added", collection: "tasks" },
    steps: [{ type: "update-trigger-item", fields: { priority: "urgent" } }],
  });
  write("t1", "tasks", { _title: "Ship", priority: "high" });
  await engine.settled();
  expect(store.get("t1")?.data.priority).toBe("high");
  expect(engine.runs("f-bad")[0]).toMatchObject({ result: "failed" });
});

test("a test run describes what would happen and writes or sends nothing", async () => {
  write("f-salary", "flows", { _title: "s", status: "draft", definition: salary });
  expect(await engine.dryRun("f-salary")).toEqual({ error: "no item in money matches yet" });
  write("pay", "money", { direction: "income", amount: 20000 });
  expect(await engine.dryRun("f-salary")).toEqual({
    result: "ok",
    steps: [
      { step: 0, type: "if", outcome: "conditions met" },
      { step: 1, type: "create", outcome: "would create “Move 4000 to invest” in tasks" },
    ],
  });

  write("f-rent", "flows", { _title: "r", status: "draft", definition: rent });
  await engine.dryRun("f-rent");
  expect(tasks()).toHaveLength(0);
  expect(notified).toHaveLength(0);
  expect(engine.runs("f-rent")).toHaveLength(0);
});

test("run keys survive a restart: a slot or change that ran never runs again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cave-flows-"));
  const path = join(dir, "cave.db");
  const start = () => {
    const db = openDb(path);
    const s = createStore(db);
    const e = createFlowEngine({
      store: s,
      db,
      notifier,
      now: () => clock,
      zone: () => MX,
      log: () => {},
    });
    return { db, s, e };
  };
  try {
    const first = start();
    first.s.seedIfEmpty(seedDocs(), 1);
    store = first.s;
    flow("f-rent", rent, Date.parse("2026-10-01T12:00:00Z"));
    await first.e.job.run({ now: NOW });
    first.db.close();

    const second = start();
    expect(await second.e.job.run({ now: NOW + 60_000 })).toMatchObject({ didSomething: false });
    expect(second.s.itemsOf("tasks")).toHaveLength(1);
    second.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
