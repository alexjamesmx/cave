import { beforeEach, expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { AgentWriter } from "../../../server/agent-writer.ts";
import type { Agent } from "../../../server/agents.ts";
import { openDb } from "../../../server/db.ts";
import { createStore, type Store } from "../../../server/store.ts";
import { createSyncHandler } from "../../../server/sync.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { formatStamp, type Hlc } from "../../../shared/hlc.ts";
import type { Field } from "../../../shared/schema.ts";
import { seedDocs } from "../../../shared/seed.ts";
import { undoPatch } from "../../../shared/undo.ts";
import { openLocalDb } from "../store/db.ts";
import { LocalStore } from "../store/local-store.ts";
import { readSyncResponse, syncOnce, type Transport } from "../store/sync.ts";
import { undoChange } from "./undo.ts";

const agent: Agent = {
  name: "claude",
  scopes: ["read", "write"],
  collections: null,
  created: 1,
  revoked: null,
};
let server: Store;
let online: boolean;
let now: number;

beforeEach(() => {
  server = createStore(openDb(":memory:"));
  server.seedIfEmpty(seedDocs(), 1);
  online = true;
  now = 1_791_900_000_000;
});

const transport = (local: LocalStore): Transport => {
  const handle = createSyncHandler({ store: server, token: undefined, now: () => now });
  return async (req) => {
    if (!online) throw new TypeError("Failed to fetch");
    const res = await handle(
      new Request("http://cave.test/api/sync", { method: "POST", body: JSON.stringify(req) }),
    );
    return readSyncResponse(res, local);
  };
};

async function device(name: string) {
  const db = openLocalDb(`cave-${name}-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  const local = await LocalStore.open({ db, deviceId: name, now: () => now });
  const sync = async () => {
    try {
      await syncOnce(local, transport(local));
      return true;
    } catch {
      return false;
    }
  };
  await sync();
  return { local, sync };
}

const clocks = new Map<string, Hlc>();
const agentWriter = () =>
  new AgentWriter(
    server,
    agent,
    AgentWriter.clockFor(clocks, agent, () => now),
    () => now,
  );

/** The agent creates a task, then changes it; returns the id and the change row of the edit. */
function agentEdit(fields: Record<string, unknown>, edit: Record<string, unknown>) {
  const created = agentWriter().create("tasks", { title: "Ship", fields });
  if (!created.ok) throw new Error(created.error);
  now += 1000;
  const updated = agentWriter().update(created.id, { fields: edit });
  if (!updated.ok) throw new Error(updated.error);
  const [change] = server.changesBySeq(updated.seqs);
  if (!change) throw new Error("no change row");
  return { id: created.id, change };
}

const task = (id: string) => ({ id, kind: "item" as const, collection: "tasks" });

test("a newer edit waiting on the server turns the key into 'changed since'", async () => {
  const { id, change } = agentEdit({ status: "todo" }, { status: "done" });
  const laptop = await device("laptop");
  const phone = await device("phone");

  now += 1000;
  await phone.local.write(task(id), { status: "doing" });
  await phone.sync();

  // Planned from the laptop's stale copy, undo would restore `todo` over the phone's edit.
  expect(undoPatch(change, await laptop.local.get(id)).patch).toEqual({ status: "todo" });

  const result = await undoChange(change, laptop.local, laptop.sync);
  expect(result).toEqual({
    ok: true,
    plan: { patch: {}, skipped: [{ key: "status", reason: "changed since" }] },
  });
  await laptop.sync();
  expect(server.get(id)?.data.status).toBe("doing");
});

test("without a sync, undo is refused and nothing is written", async () => {
  const { id, change } = agentEdit({ status: "todo" }, { status: "done" });
  const laptop = await device("laptop");
  online = false;
  expect(await undoChange(change, laptop.local, laptop.sync)).toEqual({
    ok: false,
    error: "Needs a sync first",
  });
  expect((await laptop.local.get(id))?.data.status).toBe("done");
  expect(await laptop.local.db.outbox.count()).toBe(0);
});

test("undo restores a value whose option the owner removed since", async () => {
  const { id, change } = agentEdit({ priority: "low" }, { priority: "high" });
  const tasks = server.get("tasks");
  if (!tasks) throw new Error("no tasks");
  const fields = (tasks.data.fields as Field[]).map((f) =>
    f.id === "priority" ? { ...f, options: (f.options ?? []).filter((o) => o.value !== "low") } : f,
  );
  server.applyChanges(
    [{ ...tasks, data: { fields }, stamps: { fields: formatStamp(now + 5, 0, "phone") } }],
    "user:phone",
    now,
  );
  const laptop = await device("laptop");
  // An ordinary write of the removed option is refused...
  await expect(laptop.local.write(task(id), { priority: "low" })).rejects.toThrow(FieldValueError);
  // ...but undo puts it back, as sync would accept it.
  const result = await undoChange(change, laptop.local, laptop.sync);
  expect(result.ok && result.plan.patch).toEqual({ priority: "low" });
  await laptop.sync();
  expect(server.get(id)?.data.priority).toBe("low");
});
