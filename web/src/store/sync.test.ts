import { beforeEach, describe, expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { openDb } from "../../../server/db.ts";
import { createStore, type Store } from "../../../server/store.ts";
import { createSyncHandler } from "../../../server/sync.ts";
import { seedDocs } from "../../../shared/seed.ts";
import type { SyncRequest } from "../../../shared/types.ts";
import { openLocalDb } from "./db.ts";
import { LocalStore } from "./local-store.ts";
import {
  ClockAheadError,
  type DeviceClock,
  PUSH_BATCH_SIZE,
  readSyncResponse,
  syncOnce,
  type Transport,
} from "./sync.ts";

const REAL_NOW = 1_760_000_000_000;
const TEN_MIN = 10 * 60_000;
const task = { kind: "item", collection: "tasks" } as const;

let server: Store;
let online: boolean;
let requests: SyncRequest[];

beforeEach(() => {
  server = createStore(openDb(":memory:"));
  online = true;
  requests = [];
});

/** Calls the real sync handler in-process; `online = false` behaves like a dropped network. */
const serverClock: DeviceClock = { rawNow: () => REAL_NOW, now: () => REAL_NOW };

function makeTransport(
  beforeSend?: () => Promise<void>,
  clock: DeviceClock = serverClock,
): Transport {
  const handle = createSyncHandler({ store: server, token: undefined, now: () => REAL_NOW });
  return async (req) => {
    if (!online) throw new TypeError("Failed to fetch");
    requests.push(req);
    await beforeSend?.();
    const res = await handle(
      new Request("http://cave.test/api/sync", { method: "POST", body: JSON.stringify(req) }),
    );
    return readSyncResponse(res, clock);
  };
}

async function device(deviceId: string, now: () => number = () => REAL_NOW) {
  const db = openLocalDb(`cave-${deviceId}-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  return LocalStore.open({ db, deviceId, now });
}

describe("syncOnce", () => {
  test("an offline write stays in the outbox and syncs after reconnect", async () => {
    const phone = await device("phone");
    await phone.write({ id: "t1", ...task }, { _title: "Buy milk" });

    online = false;
    await expect(syncOnce(phone, makeTransport())).rejects.toThrow("Failed to fetch");
    expect(await phone.db.outbox.count()).toBe(1);
    expect(server.get("t1")).toBeUndefined();

    online = true;
    await syncOnce(phone, makeTransport());
    expect(server.get("t1")?.data._title).toBe("Buy milk");
    expect(server.get("t1")?.actor).toBe("user:phone");
    expect(await phone.db.outbox.count()).toBe(0);
  });

  test("a write made while a sync is in flight keeps its outbox row", async () => {
    const phone = await device("phone");
    await phone.write({ id: "t1", ...task }, { _title: "first" });

    let interleaved = false;
    const transport = makeTransport(async () => {
      if (interleaved) return;
      interleaved = true;
      await phone.write({ id: "t1", ...task }, { _title: "second" });
    });

    await syncOnce(phone, transport);
    expect(server.get("t1")?.data._title).toBe("first");
    expect(await phone.db.outbox.get("t1")).toMatchObject({ rev: 2 });
    expect((await phone.get("t1"))?.data._title).toBe("second");

    await syncOnce(phone, transport);
    expect(server.get("t1")?.data._title).toBe("second");
    expect(await phone.db.outbox.count()).toBe(0);
  });

  test("two devices editing different fields of one doc converge", async () => {
    const laptop = await device("laptop");
    const phone = await device("phone");
    await laptop.write({ id: "t1", ...task }, { _title: "Call bank" });
    await phone.write({ id: "t1", ...task }, { status: "waiting" });

    const transport = makeTransport();
    await syncOnce(laptop, transport);
    await syncOnce(phone, transport);
    await syncOnce(laptop, transport);

    const onServer = server.get("t1");
    expect(onServer?.data).toMatchObject({ _title: "Call bank", status: "waiting" });
    expect(Object.keys(onServer?.data ?? {}).sort()).toEqual(["_created", "_title", "status"]);
    expect(await laptop.get("t1")).toMatchObject({
      data: onServer?.data,
      stamps: onServer?.stamps,
    });
    expect(await phone.get("t1")).toMatchObject({ data: onServer?.data, stamps: onServer?.stamps });
  });

  test("a device with a clock 10 minutes behind wins with an edit made after it synced", async () => {
    const laptop = await device("laptop");
    const phone = await device("phone", () => REAL_NOW - TEN_MIN);
    const transport = makeTransport();

    await laptop.write({ id: "t1", ...task }, { status: "todo" });
    await syncOnce(laptop, transport);
    await syncOnce(phone, transport);

    await phone.write({ id: "t1", ...task }, { status: "done" });
    await syncOnce(phone, transport);
    await syncOnce(laptop, transport);

    expect(server.get("t1")?.data.status).toBe("done");
    expect((await laptop.get("t1"))?.data.status).toBe("done");
  });

  test("the client keeps pulling until a page has fewer than 1000 docs", async () => {
    const docs = Array.from({ length: 2500 }, (_, i) => ({
      id: `d${i}`,
      ...task,
      data: { n: i },
      stamps: { n: `0000000000001:0000:laptop` },
      actor: "user:laptop",
    }));
    server.applyChanges(docs, "user:laptop", REAL_NOW);

    const phone = await device("phone");
    await syncOnce(phone, makeTransport());

    expect(requests.map((r) => r.cursor)).toEqual([0, 1000, 2000]);
    expect(await phone.db.docs.count()).toBe(2500);
    expect(await phone.cursor()).toBe(server.seqOf("d2499") as number);
  });

  test("a long offline backlog is pushed in batches", async () => {
    const phone = await device("phone");
    const total = PUSH_BATCH_SIZE * 2 + 5;
    for (let i = 0; i < total; i++) await phone.write({ id: `t${i}`, ...task }, { n: i });

    await syncOnce(phone, makeTransport());
    expect(requests.map((r) => r.changes.length)).toEqual([PUSH_BATCH_SIZE, PUSH_BATCH_SIZE, 5]);
    expect(server.changesSince(0, 10_000)).toHaveLength(total);
    expect(await phone.db.outbox.count()).toBe(0);
  });

  test("the clock survives reopening the local store", async () => {
    const db = openLocalDb(`cave-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
    const first = await LocalStore.open({ db, deviceId: "phone", now: () => REAL_NOW });
    const a = await first.write({ id: "t1", ...task }, { status: "todo" });

    const second = await LocalStore.open({ db, deviceId: "phone", now: () => REAL_NOW - TEN_MIN });
    const b = await second.write({ id: "t1", ...task }, { status: "done" });
    expect((b.stamps.status as string) > (a.stamps.status as string)).toBe(true);
  });

  test("a device an hour ahead is refused, recovers its clock and then syncs", async () => {
    const HOUR = 60 * 60_000;
    const phone = await device("phone", () => REAL_NOW + HOUR);
    await phone.write({ id: "t1", ...task }, { _title: "From the future" });
    await phone.write({ id: "t2", ...task }, { _title: "Also ahead" });

    const refused = await syncOnce(phone, makeTransport(undefined, phone)).catch((e) => e);
    expect(refused).toBeInstanceOf(ClockAheadError);
    const { serverTime, rawDeviceTime } = refused as ClockAheadError;
    expect(serverTime).toBe(REAL_NOW);
    expect(server.get("t1")).toBeUndefined();

    expect(await phone.recoverClock(serverTime, rawDeviceTime)).toBe(2);
    await syncOnce(phone, makeTransport());
    expect(server.get("t1")?.data._title).toBe("From the future");
    expect(await phone.db.outbox.count()).toBe(0);

    // The device clock is still an hour fast; new writes follow server time.
    await phone.write({ id: "t3", ...task }, { _title: "After recovery" });
    await syncOnce(phone, makeTransport());
    expect(server.get("t3")?.data._created).toBe(new Date(REAL_NOW).toISOString());
  });

  test("recovery measures the offset when the refusal arrived, not when the owner confirms", async () => {
    const HOUR = 60 * 60_000;
    const FIVE_MIN = 5 * 60_000;
    let deviceTime = REAL_NOW + HOUR;
    const phone = await device("phone", () => deviceTime);
    await phone.write({ id: "t1", ...task }, { _title: "ahead" });

    const refused = (await syncOnce(phone, makeTransport(undefined, phone)).catch(
      (e) => e,
    )) as ClockAheadError;
    deviceTime += FIVE_MIN;
    await phone.recoverClock(refused.serverTime, refused.rawDeviceTime);

    // Five real minutes have passed since the server said REAL_NOW.
    expect(phone.now()).toBe(REAL_NOW + FIVE_MIN);
  });

  test("the offset is dropped once the device clock agrees with the server again", async () => {
    const HOUR = 60 * 60_000;
    let deviceTime = REAL_NOW + HOUR;
    const phone = await device("phone", () => deviceTime);
    await phone.recoverClock(REAL_NOW, deviceTime);

    await syncOnce(phone, makeTransport(undefined, phone));
    expect(phone.now()).toBe(REAL_NOW);
    expect(await phone.db.meta.get("clockOffset")).toBeDefined();

    deviceTime = REAL_NOW + 59_000;
    await syncOnce(phone, makeTransport(undefined, phone));
    expect(await phone.db.meta.get("clockOffset")).toBeUndefined();
    expect(phone.now()).toBe(deviceTime);
  });

  test("a rejected doc keeps its outbox row and error; the rest of the batch syncs", async () => {
    server.seedIfEmpty(seedDocs(), REAL_NOW);
    const phone = await device("phone");
    // This device has not pulled the tasks collection yet, so it cannot check `due` itself.
    await phone.write({ id: "bad", ...task }, { _title: "x", due: "tomorrow" });
    await phone.write({ id: "good", ...task }, { _title: "y", due: "2026-10-12" });

    const result = await syncOnce(phone, makeTransport());
    expect(result.rejected).toBe(1);
    expect(server.get("good")?.data.due).toBe("2026-10-12");
    expect(server.get("bad")).toBeUndefined();
    expect((await phone.db.outbox.toArray()).map((r) => r.id)).toEqual(["bad"]);
    expect(await phone.db.rejected.get("bad")).toEqual({
      id: "bad",
      error: "field due: must be YYYY-MM-DD",
    });

    await phone.write({ id: "bad", ...task }, { due: "2026-10-13" });
    await syncOnce(phone, makeTransport());
    expect(server.get("bad")?.data.due).toBe("2026-10-13");
    expect(await phone.db.outbox.count()).toBe(0);
    expect(await phone.db.rejected.count()).toBe(0);
  });

  test("the outbox pushes settings, then collections, then items", async () => {
    const phone = await device("phone");
    await phone.write({ id: "t1", ...task }, { _title: "item first" });
    await phone.write({ id: "c1", kind: "collection", collection: null }, { name: "New" });
    await phone.write({ id: "settings", kind: "setting", collection: null }, { timezone: "UTC" });
    expect((await phone.pending()).map((p) => p.doc.kind)).toEqual([
      "setting",
      "collection",
      "item",
    ]);
  });
});
