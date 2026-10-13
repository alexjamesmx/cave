import { expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { FieldValueError } from "../../../shared/fields.ts";
import { seedDocs } from "../../../shared/seed.ts";
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

test("a write with an invalid field value is refused and leaves no trace", async () => {
  const db = sharedDb();
  await db.docs.bulkPut(seedDocs());
  const store = await tab(db);

  const write = store.write({ id: "t1", ...task }, { _title: "Pay", due: "12/10/2026" });
  await expect(write).rejects.toThrow(FieldValueError);
  await expect(write).rejects.toThrow("field due: must be YYYY-MM-DD");
  expect(await store.get("t1")).toBeUndefined();
  expect(await db.outbox.count()).toBe(0);

  await store.write({ id: "t1", ...task }, { _title: "Pay", due: "2026-10-12" });
  expect((await store.get("t1"))?.data.due).toBe("2026-10-12");
});

test("clock recovery re-stamps only keys ahead of server time and reaches other tabs", async () => {
  const HOUR = 60 * 60_000;
  const db = sharedDb();
  const behind = await LocalStore.open({ db, deviceId: "laptop", now: () => NOW - HOUR });
  const old = await behind.write({ id: "t0", ...task }, { _title: "old" });

  const fast = await LocalStore.open({ db, deviceId: "laptop", now: () => NOW + HOUR });
  const other = await LocalStore.open({ db, deviceId: "laptop", now: () => NOW + HOUR });
  const ahead = await fast.write({ id: "t1", ...task }, { _title: "ahead" });
  await db.outbox.clear();

  expect(await fast.recoverClock(NOW)).toBe(1);
  expect((await fast.get("t0"))?.stamps).toEqual(old.stamps);
  const restamped = (await fast.get("t1"))?.stamps ?? {};
  for (const key of Object.keys(ahead.stamps)) {
    expect(restamped[key]?.startsWith(String(NOW))).toBe(true);
  }
  expect(await db.outbox.get("t1")).toMatchObject({ rev: 1 });

  const fromOtherTab = await other.write({ id: "t2", ...task }, { _title: "later" });
  expect(fromOtherTab.stamps._title?.startsWith(String(NOW))).toBe(true);
  expect((fromOtherTab.stamps._title as string) > (restamped._title as string)).toBe(true);
});
