import { beforeEach, describe, expect, test } from "bun:test";
import { formatStamp } from "../shared/hlc.ts";
import type { Field } from "../shared/schema.ts";
import { seedDocs } from "../shared/seed.ts";
import type { Doc, SyncResponse } from "../shared/types.ts";
import { openDb } from "./db.ts";
import { createStore, type Store } from "./store.ts";
import { createSyncHandler, MAX_BODY_BYTES } from "./sync.ts";

const NOW = 1_760_000_000_000;
let store: Store;
let handle: (req: Request) => Promise<Response>;

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://cave.test/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function sync(body: unknown): Promise<SyncResponse> {
  const res = await handle(request(body));
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

function item(id: string, data: Record<string, unknown>, ms: number, device: string): Doc {
  const stamps = Object.fromEntries(Object.keys(data).map((k) => [k, formatStamp(ms, 0, device)]));
  return { id, kind: "item", collection: "tasks", data, stamps, actor: `user:${device}` };
}

beforeEach(() => {
  store = createStore(openDb(":memory:"));
  handle = createSyncHandler({ store, token: undefined, now: () => NOW });
});

describe("POST /api/sync", () => {
  test("two devices editing different fields of one doc converge", async () => {
    const a = await sync({
      deviceId: "dev-a",
      cursor: 0,
      changes: [item("t1", { _title: "Pay rent" }, 100, "dev-a")],
    });
    const b = await sync({
      deviceId: "dev-b",
      cursor: 0,
      changes: [item("t1", { status: "doing" }, 200, "dev-b")],
    });
    const aAgain = await sync({ deviceId: "dev-a", cursor: a.cursor, changes: [] });

    const expected = { _title: "Pay rent", status: "doing" };
    expect(b.changes.find((d) => d.id === "t1")?.data).toEqual(expected);
    expect(aAgain.changes.find((d) => d.id === "t1")?.data).toEqual(expected);
    expect(store.get("t1")?.data).toEqual(expected);
  });

  test("re-sending an identical change keeps seq and the activity log unchanged", async () => {
    const body = {
      deviceId: "dev-a",
      cursor: 0,
      changes: [item("t1", { _title: "x" }, 1, "dev-a")],
    };
    await sync(body);
    const seq = store.seqOf("t1");
    const logLength = store.changeLog().length;

    await sync(body);
    await sync(body);
    expect(store.seqOf("t1")).toBe(seq);
    expect(store.changeLog().length).toBe(logLength);
  });

  test("an older change is ignored and does not bump seq", async () => {
    await sync({
      deviceId: "dev-a",
      cursor: 0,
      changes: [item("t1", { _title: "new" }, 50, "dev-a")],
    });
    const seq = store.seqOf("t1");
    await sync({
      deviceId: "dev-b",
      cursor: 0,
      changes: [item("t1", { _title: "old" }, 10, "dev-b")],
    });
    expect(store.seqOf("t1")).toBe(seq);
    expect(store.get("t1")?.data._title).toBe("new");
  });

  test("each stored change is logged with its actor, time and keys", async () => {
    await sync({
      deviceId: "dev-a",
      cursor: 0,
      changes: [item("t1", { _title: "x", status: "todo" }, 1, "dev-a")],
    });
    await sync({
      deviceId: "dev-b",
      cursor: 0,
      changes: [item("t1", { status: "done" }, 2, "dev-b")],
    });

    const log = store.changeLog();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ id: "t1", actor: "user:dev-a", at: NOW });
    expect(log[0]?.keys.sort()).toEqual(["_title", "status"]);
    expect(log[1]).toMatchObject({ id: "t1", actor: "user:dev-b", keys: ["status"] });
    expect(store.seqOf("t1")).toBe(log[1]?.seq);
  });

  test("pulls are paged at 1000 docs and the cursor is the last seq sent", async () => {
    const docs = Array.from({ length: 2500 }, (_, i) => item(`d${i}`, { n: i }, 1, "dev-a"));
    store.applyChanges(docs, "user:dev-a", NOW);

    const pages: SyncResponse[] = [];
    let cursor = 0;
    for (;;) {
      const page = await sync({ deviceId: "dev-b", cursor, changes: [] });
      pages.push(page);
      const last = page.changes.at(-1);
      expect(page.cursor).toBe(last ? (store.seqOf(last.id) as number) : cursor);
      cursor = page.cursor;
      if (page.changes.length < 1000) break;
    }

    expect(pages.map((p) => p.changes.length)).toEqual([1000, 1000, 500]);
    expect(new Set(pages.flatMap((p) => p.changes.map((d) => d.id))).size).toBe(2500);

    const caughtUp = await sync({ deviceId: "dev-b", cursor, changes: [] });
    expect(caughtUp).toEqual({ cursor, changes: [] });
  });
});

describe("POST /api/sync validation", () => {
  const valid = item("t1", { _title: "x" }, 1, "dev-a");

  async function expect400(body: unknown) {
    const res = await handle(request(body));
    expect(res.status).toBe(400);
    expect(store.changeLog()).toHaveLength(0);
  }

  test("unknown kind", () =>
    expect400({ deviceId: "d", cursor: 0, changes: [{ ...valid, kind: "blob" }] }));

  test("bad ids", async () => {
    for (const id of ["", "Has Space", "../etc", "imp-xyz", "x".repeat(65), 42]) {
      await expect400({ deviceId: "d", cursor: 0, changes: [{ ...valid, id }] });
    }
  });

  test("oversized body", async () => {
    const big = item("t1", { _body: "x".repeat(MAX_BODY_BYTES) }, 1, "dev-a");
    await expect400({ deviceId: "d", cursor: 0, changes: [big] });
  });

  test("malformed payloads", async () => {
    const cases: unknown[] = [
      "{not json",
      [],
      { deviceId: "d", cursor: 0 },
      { deviceId: "", cursor: 0, changes: [] },
      { deviceId: "d:colon", cursor: 0, changes: [] },
      { deviceId: "d", cursor: -1, changes: [] },
      { deviceId: "d", cursor: 1.5, changes: [] },
      { deviceId: "d", cursor: 0, changes: [{ ...valid, stamps: {} }] },
      { deviceId: "d", cursor: 0, changes: [{ ...valid, stamps: { _title: "yesterday" } }] },
      { deviceId: "d", cursor: 0, changes: [{ ...valid, data: [] }] },
      { deviceId: "d", cursor: 0, changes: [{ ...valid, collection: 7 }] },
      `{"deviceId":"d","cursor":0,"changes":[{"id":"t1","kind":"item","collection":"tasks","data":{"__proto__":{"x":1}},"stamps":{"__proto__":"0000000000001:0000:a"}}]}`,
      {
        deviceId: "d",
        cursor: 0,
        changes: Array.from({ length: 1001 }, (_, i) => item(`d${i}`, { n: 1 }, 1, "a")),
      },
    ];
    for (const body of cases) await expect400(body);
  });

  test("one bad doc rejects the whole batch", () =>
    expect400({ deviceId: "d", cursor: 0, changes: [valid, { ...valid, id: "bad id" }] }));

  test("an item needs a collection; collections and settings must not have one", async () => {
    const cases = [
      { ...valid, kind: "item", collection: null },
      { ...valid, kind: "collection", collection: "tasks" },
      { ...valid, kind: "setting", collection: "tasks" },
    ];
    for (const doc of cases) await expect400({ deviceId: "d", cursor: 0, changes: [doc] });
  });
});

describe("field values", () => {
  beforeEach(() => {
    store.seedIfEmpty(seedDocs(), NOW);
  });
  const push = (changes: Doc[]) => handle(request({ deviceId: "dev-a", cursor: 0, changes }));

  test("rejects an item whose value does not fit its field, naming the field", async () => {
    const res = await push([item("t1", { _title: "x", status: "someday" }, 1, "dev-a")]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "changes[0]: field status: must be one of: todo, doing, waiting, done, dropped",
    );
    expect(store.get("t1")).toBeUndefined();
  });

  test("accepts valid values, nulls and keys that are not fields", async () => {
    const doc = item("t1", { status: "done", due: "2026-10-12", area: null, extra: 5 }, 1, "dev-a");
    expect((await push([doc])).status).toBe(200);
    expect(store.get("t1")?.data.status).toBe("done");
  });

  test("checks against a collection pushed in the same request", async () => {
    const tasks = store.get("tasks") as Doc;
    const fields = [
      ...(tasks.data.fields as Field[]),
      { id: "size", name: "Size", type: "number" },
    ];
    const edited: Doc = {
      ...tasks,
      data: { fields },
      stamps: { fields: formatStamp(1, 0, "dev-a") },
    };
    const bad = await push([edited, item("t1", { size: "big" }, 1, "dev-a")]);
    expect(bad.status).toBe(400);
    expect((await push([edited, item("t1", { size: 3 }, 1, "dev-a")])).status).toBe(200);
  });

  test("items of a collection the server has not seen are not field-checked", async () => {
    const doc = { ...item("n1", { anything: "goes" }, 1, "dev-a"), collection: "newcol" };
    expect((await push([doc])).status).toBe(200);
  });
});

describe("clock skew", () => {
  const MIN = 60_000;

  test("rejects a stamp more than 10 minutes ahead and reports server time", async () => {
    const ahead = item("t1", { _title: "from the future" }, NOW + 11 * MIN, "dev-a");
    const res = await handle(request({ deviceId: "dev-a", cursor: 0, changes: [ahead] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "clock ahead", serverTime: NOW });
    expect(store.get("t1")).toBeUndefined();
  });

  test("accepts a stamp 9 minutes ahead", async () => {
    const ahead = item("t1", { _title: "slightly fast" }, NOW + 9 * MIN, "dev-a");
    await sync({ deviceId: "dev-a", cursor: 0, changes: [ahead] });
    expect(store.get("t1")?.data._title).toBe("slightly fast");
  });
});

describe("auth", () => {
  beforeEach(() => {
    handle = createSyncHandler({ store, token: "s3cret", now: () => NOW });
  });
  const body = { deviceId: "d", cursor: 0, changes: [] };

  test("rejects a missing or wrong bearer token", async () => {
    expect((await handle(request(body))).status).toBe(401);
    expect((await handle(request(body, { authorization: "Bearer nope" }))).status).toBe(401);
    expect((await handle(request(body, { authorization: "s3cret" }))).status).toBe(401);
  });

  test("accepts the right bearer token", async () => {
    expect((await handle(request(body, { authorization: "Bearer s3cret" }))).status).toBe(200);
  });
});
