import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, SCHEMA_VERSION } from "./db.ts";
import { createStore } from "./store.ts";

// The schema shipped in 6ec5478, before migrations existed (user_version 0).
const M1_SCHEMA = `
CREATE TABLE docs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, collection TEXT, data TEXT NOT NULL,
  stamps TEXT NOT NULL, seq INTEGER NOT NULL, actor TEXT NOT NULL);
CREATE INDEX docs_seq ON docs (seq);
CREATE TABLE changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, actor TEXT NOT NULL,
  at INTEGER NOT NULL, keys TEXT NOT NULL);
INSERT INTO docs VALUES ('t1', 'item', 'tasks', '{"status":"todo"}',
  '{"status":"0000000000010:0000:dev-a"}', 1, 'user:dev-a');
INSERT INTO changes (id, actor, at, keys) VALUES ('t1', 'user:dev-a', 1, '["status"]');
`;

const userVersion = (db: Database) =>
  db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version;

test("a fresh database is created at the current schema version", () => {
  expect(userVersion(openDb(":memory:"))).toBe(SCHEMA_VERSION);
});

test("an M1 database is migrated in place and keeps its data", () => {
  const dir = mkdtempSync(join(tmpdir(), "cave-"));
  try {
    const path = join(dir, "cave.db");
    const old = new Database(path, { create: true });
    old.exec(M1_SCHEMA);
    old.close();

    const db = openDb(path);
    expect(userVersion(db)).toBe(SCHEMA_VERSION);
    const store = createStore(db);
    expect(store.get("t1")?.data).toEqual({ status: "todo" });
    expect(store.changeLog()).toEqual([
      { seq: 1, id: "t1", actor: "user:dev-a", at: 1, keys: ["status"], before: null, after: null },
    ]);
    db.close();

    const reopened = openDb(path);
    expect(userVersion(reopened)).toBe(SCHEMA_VERSION);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses a database written by a newer build", () => {
  const dir = mkdtempSync(join(tmpdir(), "cave-"));
  try {
    const path = join(dir, "cave.db");
    const newer = new Database(path, { create: true });
    newer.run(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    newer.close();
    expect(() => openDb(path)).toThrow("newer than this build");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
