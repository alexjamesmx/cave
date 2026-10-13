import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  collection TEXT,
  data TEXT NOT NULL,
  stamps TEXT NOT NULL,
  seq INTEGER NOT NULL,
  actor TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS docs_seq ON docs (seq);
CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  actor TEXT NOT NULL,
  at INTEGER NOT NULL,
  keys TEXT NOT NULL
);
`;

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}
