import { expect, test } from "bun:test";
import { SEED_VERSION, seedDocs } from "../shared/seed.ts";
import { AgentWriter } from "./agent-writer.ts";
import { createAgentRegistry } from "./agents.ts";
import { openDb } from "./db.ts";
import { exportAll, exportName } from "./export.ts";
import { migrateSeed } from "./seed-migrations.ts";
import { createStore } from "./store.ts";

const NOW = Date.UTC(2026, 9, 13, 14, 5, 12);

test("an export imported into an empty store gives back every doc byte for byte", () => {
  const db = openDb(":memory:");
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  migrateSeed(store, 2);
  const stamp = (ms: number) => `${ms}:0000:laptop`;
  store.applyChanges(
    [
      {
        id: "t1",
        kind: "item",
        collection: "tasks",
        data: { _title: "Ship", status: "todo" },
        stamps: { _title: stamp(NOW), status: stamp(NOW) },
        actor: "",
      },
      {
        id: "t2",
        kind: "item",
        collection: "tasks",
        data: { _title: "Gone", _deleted: true },
        stamps: { _title: stamp(NOW), _deleted: stamp(NOW + 1) },
        actor: "",
      },
    ],
    "user:laptop",
    NOW,
  );
  const registry = createAgentRegistry(db);
  const added = registry.add("claude", ["read", "write"], null, NOW);
  if (!added.ok) throw new Error(added.error);
  const agent = registry.authenticate(added.value.token);
  if (!agent) throw new Error("no agent");
  const clocks = new Map();
  new AgentWriter(
    store,
    agent,
    AgentWriter.clockFor(clocks, agent, () => NOW),
    () => NOW,
  ).create("tasks", { title: "From an agent" });

  const exported = JSON.parse(JSON.stringify(exportAll(store, NOW)));
  expect(exported).toMatchObject({
    format: 1,
    exportedAt: "2026-10-13T14:05:12.000Z",
    seedVersion: SEED_VERSION,
  });
  expect(exported.docs.some((d: { id: string }) => d.id === "t2")).toBe(true);
  const text = JSON.stringify(exported);
  expect(text).not.toContain(added.value.token);
  expect(text).not.toContain("token_hash");

  const empty = createStore(openDb(":memory:"));
  for (const doc of exported.docs) empty.applyChanges([doc], doc.actor, NOW);
  expect(JSON.stringify(empty.allDocs())).toBe(JSON.stringify(store.allDocs()));
});

test("export file names are UTC seconds", () => {
  expect(exportName(NOW)).toBe("cave-2026-10-13T140512.json");
});
