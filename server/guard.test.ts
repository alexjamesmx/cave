import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { seedDocs } from "../shared/seed.ts";
import { createCallLog } from "./agent-calls.ts";
import { createAgentRegistry } from "./agents.ts";
import { serveCave } from "./app.ts";
import { openDb } from "./db.ts";
import { createStore } from "./store.ts";

let server: ReturnType<typeof serveCave>;
let token: string;

beforeAll(() => {
  const db = openDb(":memory:");
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  const registry = createAgentRegistry(db);
  const added = registry.add("claude", ["read"], null, 1);
  if (!added.ok) throw new Error(added.error);
  token = added.value.token;
  server = serveCave({
    hostname: "127.0.0.1",
    port: 0,
    store,
    token: undefined,
    now: Date.now,
    agents: { registry, calls: createCallLog(db), vaultPath: undefined },
    status: { version: "test", backupDir: "missing-dir", newVaultNotes: () => null },
  });
});

afterAll(() => server.stop(true));

const own = () => new URL(server.url).origin;

const bodies = {
  "/api/sync": { deviceId: "laptop", cursor: 0, changes: [] },
  "/mcp": { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
};

function post(path: keyof typeof bodies, headers: Record<string, string> = {}) {
  return fetch(new URL(path, server.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${path === "/mcp" ? token : ""}`,
      ...headers,
    },
    body: JSON.stringify(bodies[path]),
  });
}

describe.each(["/api/sync", "/mcp"] as const)("%s", (path) => {
  test("a foreign Host gets 403", async () => {
    expect((await post(path, { host: "evil.example" })).status).toBe(403);
  });

  test("an Origin on another port gets 403", async () => {
    const other = new URL(server.url);
    other.port = String(Number(other.port) + 1);
    expect((await post(path, { origin: other.origin })).status).toBe(403);
    expect((await post(path, { origin: "https://evil.example" })).status).toBe(403);
  });

  test("a text/plain body gets 415", async () => {
    expect((await post(path, { "content-type": "text/plain" })).status).toBe(415);
  });

  test("the app's own requests pass", async () => {
    expect((await post(path)).status).toBe(200);
    expect((await post(path, { origin: own() })).status).toBe(200);
  });
});

test("every /api route sits behind the guard", async () => {
  for (const path of [
    "/api/agents",
    "/api/activity",
    "/api/history/money",
    "/api/status",
    "/api/export",
  ]) {
    const res = await fetch(new URL(path, server.url), { headers: { host: "evil.example" } });
    expect(res.status).toBe(403);
  }
});

test("every /api and /mcp answer says no-store, refusals included", async () => {
  const answers = [
    await post("/api/sync"),
    await post("/mcp"),
    await post("/api/sync", { host: "evil.example" }),
    await post("/mcp", { "content-type": "text/plain" }),
    ...(await Promise.all(
      [
        "/api/status",
        "/api/export",
        "/api/agents",
        "/api/activity",
        "/api/history/money",
        "/api/nope",
      ].map((path) => fetch(new URL(path, server.url))),
    )),
  ];
  expect(answers.map((res) => res.status)).toEqual([
    200, 200, 403, 415, 200, 200, 200, 200, 200, 404,
  ]);
  for (const res of answers) expect(res.headers.get("cache-control")).toBe("no-store");
});
