import { afterAll, beforeAll, expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import { seedDocs } from "../../shared/seed.ts";
import { serveCave } from "../app.ts";
import { openDb } from "../db.ts";
import { createStore } from "../store.ts";
import { flowRoutes } from "./api.ts";
import { createFlowEngine } from "./engine.ts";

const OWNER = "owner-secret";
let server: ReturnType<typeof serveCave>;

beforeAll(() => {
  const db = openDb(":memory:");
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  const stamp = formatStamp(Date.now(), 0, "test");
  store.applyChanges(
    [
      {
        id: "bad",
        kind: "item",
        collection: "flows",
        data: { status: "draft", definition: { version: 2 } },
        stamps: { status: stamp, definition: stamp },
        actor: "owner",
      },
    ],
    "owner",
    Date.now(),
  );
  const engine = createFlowEngine({
    store,
    db,
    notifier: { statuses: () => [], notify: async () => ({ delivered: 0, failed: 0 }) },
    now: Date.now,
    zone: () => ({ timeZone: "America/Mexico_City", defaultTime: "09:00" }),
    log: () => {},
  });
  server = serveCave({
    hostname: "127.0.0.1",
    port: 0,
    store,
    token: OWNER,
    now: Date.now,
    flows: flowRoutes(engine),
  });
});
afterAll(() => server.stop(true));

const call = (path: string, method = "GET", token: string | null = OWNER) =>
  fetch(new URL(path, server.url), {
    method,
    ...(method === "POST" ? { body: "{}" } : {}),
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

test("a test run of a seeded draft describes it; unknown and invalid flows say why", async () => {
  const rent = await call("/api/flows/flow-rent/test", "POST");
  expect(rent.status).toBe(200);
  expect(await rent.json()).toMatchObject({
    result: "ok",
    steps: [
      { outcome: "would create “Pay rent” in tasks" },
      { outcome: "notify skipped: push off" },
    ],
  });
  expect((await call("/api/flows/nope/test", "POST")).status).toBe(404);
  expect(await (await call("/api/flows/bad/test", "POST")).json()).toEqual({
    error: "the definition is not valid",
  });
});

test("run history is the owner's only", async () => {
  expect(await (await call("/api/flows/flow-rent/runs")).json()).toEqual({ runs: [] });
  expect((await call("/api/flows/flow-rent/runs", "GET", null)).status).toBe(401);
});
