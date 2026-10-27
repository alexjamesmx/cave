import { beforeEach, expect, test } from "bun:test";
import type { FlowDefinition } from "../../shared/flows/registry.ts";
import { Hlc } from "../../shared/hlc.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { CallLog } from "../agent-calls.ts";
import { AgentWriter } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import {
  listFlows,
  MAX_ON_FLOWS,
  MAX_SAVES_PER_DAY,
  type SaveFlowArgs,
  saveFlow,
} from "./flows.ts";

const NOW = Date.parse("2026-10-15T16:00:00Z");
const claude: Agent = {
  name: "claude",
  scopes: ["read", "write"],
  collections: null,
  created: 0,
  revoked: null,
};
const moneyOnly: Agent = { ...claude, name: "money-only", collections: ["money"] };

let store: Store;
let savesToday: number;
const calls = { countSince: () => savesToday } as unknown as CallLog;

beforeEach(() => {
  store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  savesToday = 0;
});

const save = (args: Omit<SaveFlowArgs, "title"> & { title?: string }, agent = claude) =>
  saveFlow(
    store,
    agent,
    new AgentWriter(store, agent, new Hlc(`agent-${agent.name}`, () => NOW), () => NOW),
    calls,
    { title: "A flow", ...args },
    NOW,
  );

const weekly: FlowDefinition = {
  version: 1,
  trigger: { type: "schedule", every: "week", weekday: 1, at: "08:00" },
  steps: [{ type: "create", collection: "tasks", title: "Plan the week" }],
};
const archive: FlowDefinition = {
  version: 1,
  trigger: { type: "item-changed", collection: "tasks", field: "status", to: "done" },
  steps: [{ type: "update-trigger-item", fields: { area: "archive" } }],
};

test("a flow of non-sensitive steps is saved on, by the agent", () => {
  const saved = save({ definition: weekly });
  expect(saved).toMatchObject({ ok: true, status: "on" });
  const doc = store.get(saved.ok ? saved.id : "");
  expect(doc?.data).toMatchObject({ status: "on", author: "claude", definition: weekly });
  expect(store.changesFor(doc?.id ?? "", 1)[0]?.actor).toBe("agent:claude");
});

test("a sensitive step waits for approval, and an agent can't turn a waiting flow on", () => {
  const saved = save({ definition: archive });
  expect(saved).toMatchObject({ ok: true, status: "pending-approval" });
  const id = saved.ok ? saved.id : "";
  expect(save({ id, definition: weekly, status: "on" })).toMatchObject({
    status: "pending-approval",
  });
  expect(save({ id, definition: weekly, status: "off" })).toMatchObject({ status: "off" });
  expect(store.get(id)?.data.status).toBe("off");
});

test("a flow can't reach past the agent's allowlist or name unknown fields", () => {
  expect(save({ definition: weekly }, moneyOnly)).toEqual({
    ok: false,
    error: "collection tasks not found",
  });
  expect(
    save({
      definition: { ...weekly, steps: [{ type: "create", collection: "flows", title: "x" }] },
    }),
  ).toEqual({ ok: false, error: "collection flows not found" });
  expect(
    save({
      definition: {
        ...weekly,
        steps: [{ type: "create", collection: "tasks", title: "x", fields: { colour: "red" } }],
      },
    }),
  ).toEqual({ ok: false, error: "unknown field colour in tasks" });
  expect(
    save({ definition: { ...weekly, steps: [{ type: "update-trigger-item", fields: {} }] } }),
  ).toEqual({ ok: false, error: "update-trigger-item needs an item trigger" });
});

test("only flows can be replaced through save_flow, and the definition is validated", () => {
  expect(save({ id: "tasks", definition: weekly })).toEqual({
    ok: false,
    error: "flow tasks not found",
  });
  expect(save({ definition: { version: 1, trigger: weekly.trigger, steps: [] } })).toMatchObject({
    ok: false,
  });
});

test("limits: saves a day, and flows on per agent", () => {
  savesToday = MAX_SAVES_PER_DAY;
  expect(save({ definition: weekly })).toEqual({
    ok: false,
    error: `at most ${MAX_SAVES_PER_DAY} flow saves a day`,
  });
  savesToday = 0;
  for (let i = 0; i < MAX_ON_FLOWS; i++) expect(save({ definition: weekly }).ok).toBe(true);
  expect(save({ definition: weekly })).toMatchObject({ ok: false });
  expect(save({ definition: weekly, status: "draft" })).toMatchObject({ ok: true });
});

test("an allowlisted agent neither sees nor replaces a flow outside its collections", () => {
  const saved = save({ definition: weekly });
  const id = saved.ok ? saved.id : "";
  const moneyFlow: FlowDefinition = {
    version: 1,
    trigger: { type: "item-added", collection: "money" },
    steps: [{ type: "notify", title: "New entry: {{item.title}}", open: "trigger-item" }],
  };
  const own = save({ definition: moneyFlow }, moneyOnly);
  const ids = (agent: Agent) => {
    const listed = listFlows(store, agent);
    return listed.ok ? (listed.value as { flows: { id: string }[] }).flows.map((f) => f.id) : [];
  };
  expect(ids(claude)).toEqual(expect.arrayContaining([id, "flow-rent", "flow-salary"]));
  // Money's budget flows are within its reach; the digest, which reads everything, is not.
  expect(ids(moneyOnly)).toEqual(["flow-budget-80", "flow-budget-100", own.ok ? own.id : ""]);
  expect(save({ id, definition: moneyFlow }, moneyOnly)).toEqual({
    ok: false,
    error: `flow ${id} not found`,
  });
});
