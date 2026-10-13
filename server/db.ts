import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Applied in order; `PRAGMA user_version` records how many have run. Append only:
 * never edit a migration that has shipped. Migration 1 uses IF NOT EXISTS because
 * databases created by the first M1 build already have its tables at user_version 0.
 */
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS docs (
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
   );`,
  // Previous value and stamp per changed key, for undo. Older rows get JSON null: not recorded.
  `ALTER TABLE changes ADD COLUMN before TEXT NOT NULL DEFAULT 'null';`,
  // The item drawer reads one doc's history.
  `CREATE INDEX IF NOT EXISTS changes_id ON changes (id, seq);`,
  // Agent tokens: only the SHA-256 of a token is stored. `collections` NULL means all.
  `CREATE TABLE agents (
     name TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL UNIQUE,
     scopes TEXT NOT NULL,
     collections TEXT,
     created INTEGER NOT NULL,
     revoked INTEGER
   );`,
  // Every MCP tool call, reads included; `change_seqs` links a write to its change rows.
  `CREATE TABLE agent_calls (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     agent TEXT NOT NULL,
     tool TEXT NOT NULL,
     args TEXT NOT NULL,
     at INTEGER NOT NULL,
     ok INTEGER NOT NULL,
     error TEXT,
     change_seqs TEXT NOT NULL DEFAULT '[]'
   );
   CREATE INDEX agent_calls_agent ON agent_calls (agent, seq);`,
  // The stamp each changed key got, so undo can tell whether a key changed since.
  `ALTER TABLE changes ADD COLUMN after TEXT;`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  try {
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

// IMMEDIATE so a second process opening the same file waits instead of migrating twice.
function migrate(db: Database): void {
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    const from = current?.user_version ?? 0;
    if (from > MIGRATIONS.length) {
      throw new Error(`database schema v${from} is newer than this build (v${MIGRATIONS.length})`);
    }
    for (const sql of MIGRATIONS.slice(from)) db.exec(sql);
    db.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }).immediate();
}
