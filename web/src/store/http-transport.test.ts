import { afterAll, beforeAll, expect, test } from "bun:test";
import { serveCave } from "../../../server/app.ts";
import { openDb } from "../../../server/db.ts";
import { createStore, type Store } from "../../../server/store.ts";
import { formatStamp } from "../../../shared/hlc.ts";
import type { Doc } from "../../../shared/types.ts";
import { ClockAheadError, httpTransport } from "./sync.ts";

const TOKEN = "test-token";
let server: ReturnType<typeof serveCave>;
let store: Store;
let url: string;

beforeAll(() => {
  store = createStore(openDb(":memory:"));
  server = serveCave({ hostname: "127.0.0.1", port: 0, store, token: TOKEN, now: Date.now });
  url = new URL("/api/sync", server.url).href;
});

afterAll(() => server.stop(true));

const item = (id: string, ms: number): Doc => ({
  id,
  kind: "item",
  collection: "tasks",
  data: { _title: id },
  stamps: { _title: formatStamp(ms, 0, "phone") },
  actor: "",
});

test("pushes and pulls over a real socket with the bearer token", async () => {
  const send = httpTransport(url, Date.now, TOKEN);
  const res = await send({ deviceId: "phone", cursor: 0, changes: [item("t1", Date.now())] });
  expect(res.changes.map((d) => d.id)).toEqual(["t1"]);
  expect(store.get("t1")?.actor).toBe("user:phone");

  const again = await send({ deviceId: "phone", cursor: res.cursor, changes: [] });
  expect(again).toEqual({ cursor: res.cursor, changes: [] });
});

test("a wrong token fails with the server's reason", async () => {
  const send = httpTransport(url, Date.now, "wrong");
  await expect(send({ deviceId: "phone", cursor: 0, changes: [] })).rejects.toThrow(
    "sync failed: HTTP 401: unauthorized",
  );
});

test("a stamp an hour ahead becomes a ClockAheadError with both clocks", async () => {
  const HOUR = 60 * 60_000;
  const deviceNow = () => Date.now() + HOUR;
  const send = httpTransport(url, deviceNow, TOKEN);
  const error = await send({ deviceId: "phone", cursor: 0, changes: [item("t2", deviceNow())] })
    .then(() => undefined)
    .catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ClockAheadError);
  const { serverTime, deviceTime } = error as ClockAheadError;
  expect(Math.abs(serverTime - Date.now())).toBeLessThan(5_000);
  expect(Math.round((deviceTime - serverTime) / 60_000)).toBe(60);
  expect(store.get("t2")).toBeUndefined();
});
