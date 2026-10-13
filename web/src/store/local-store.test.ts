import { expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { openLocalDb } from "./db.ts";
import { LocalStore } from "./local-store.ts";

const NOW = 1_760_000_000_000;
const task = { kind: "item", collection: "tasks" } as const;

const sharedDb = () => openLocalDb(`cave-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
const tab = (db: ReturnType<typeof sharedDb>) =>
  LocalStore.open({ db, deviceId: "laptop", now: () => NOW });

test("two tabs on one device never issue the same stamp", async () => {
  const db = sharedDb();
  const [a, b] = [await tab(db), await tab(db)];

  const first = await a.write({ id: "t1", ...task }, { status: "doing" });
  const second = await b.write({ id: "t1", ...task }, { status: "done" });

  expect(second.stamps.status).not.toBe(first.stamps.status);
  expect((second.stamps.status as string) > (first.stamps.status as string)).toBe(true);
  expect((await a.get("t1"))?.data.status).toBe("done");
});

test("a stale tab applying a pull does not move the shared clock backwards", async () => {
  const db = sharedDb();
  const [a, stale, c] = [await tab(db), await tab(db), await tab(db)];

  const written = await a.write({ id: "t1", ...task }, { status: "doing" });
  await stale.applyPulled([], 0, []);
  const next = await c.write({ id: "t2", ...task }, { status: "todo" });

  expect((next.stamps.status as string) > (written.stamps.status as string)).toBe(true);
});

test("the first write of a doc sets _created once, as a stamped UTC ISO string", async () => {
  const store = await tab(sharedDb());
  const created = await store.write({ id: "t1", ...task }, { _title: "New" });
  expect(created.data._created).toBe(new Date(NOW).toISOString());
  expect(created.stamps._created).toBeDefined();

  const edited = await store.write({ id: "t1", ...task }, { _title: "Renamed" });
  expect(edited.data._created).toBe(created.data._created);
  expect(edited.stamps._created).toBe(created.stamps._created);
});
