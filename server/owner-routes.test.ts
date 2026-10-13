import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDocs } from "../shared/seed.ts";
import { createCallLog } from "./agent-calls.ts";
import { createAgentRegistry } from "./agents.ts";
import { serveCave } from "./app.ts";
import { openDb } from "./db.ts";
import type { CaveExport } from "./export.ts";
import type { Status } from "./owner-api.ts";
import { createStore, type Store } from "./store.ts";

const OWNER = "owner-secret";
let server: ReturnType<typeof serveCave>;
let store: Store;
let agentToken: string;
let backupDir: string;

beforeAll(() => {
  backupDir = mkdtempSync(join(tmpdir(), "cave-status-"));
  writeFileSync(join(backupDir, "cave-2026-10-13T1405.db"), "");
  writeFileSync(join(backupDir, "cave-2026-10-14T0900.db.failed"), "");
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  const registry = createAgentRegistry(db);
  const added = registry.add("claude", ["read"], null, 1);
  if (!added.ok) throw new Error(added.error);
  agentToken = added.value.token;
  server = serveCave({
    hostname: "127.0.0.1",
    port: 0,
    store,
    token: OWNER,
    now: () => Date.UTC(2026, 9, 13, 14, 5, 12),
    agents: { registry, calls: createCallLog(db), vaultPath: undefined },
    status: { version: "0.1.0-dev", backupDir, newVaultNotes: () => 3 },
  });
});

afterAll(() => {
  server.stop(true);
  rmSync(backupDir, { recursive: true, force: true });
});

const get = (path: string, bearer?: string) =>
  fetch(new URL(path, server.url), {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });

test("status and export need the owner token; agent tokens are refused", async () => {
  for (const path of ["/api/status", "/api/export"]) {
    expect((await get(path)).status).toBe(401);
    expect((await get(path, agentToken)).status).toBe(401);
    expect((await get(path, OWNER)).status).toBe(200);
  }
});

test("status reports version, doc count, db id, the newest real backup and new vault notes", async () => {
  const status = (await (await get("/api/status", OWNER)).json()) as Status;
  expect(status).toEqual({
    version: "0.1.0-dev",
    docs: store.docCount(),
    dbId: store.dbId(),
    lastBackupAt: "2026-10-13T14:05:00.000Z",
    newVaultNotes: 3,
  });
});

test("export downloads every doc as a named attachment", async () => {
  const res = await get("/api/export", OWNER);
  expect(res.headers.get("content-disposition")).toBe(
    'attachment; filename="cave-2026-10-13T140512.json"',
  );
  const body = (await res.json()) as CaveExport;
  expect(body.format).toBe(1);
  expect(body.docs).toEqual(store.allDocs());
});
