import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDocs } from "../shared/seed.ts";
import {
  backupIfDue,
  backupName,
  backupTime,
  newestBackupAt,
  pruneBackups,
  selectPrunable,
  takeBackup,
  verifyBackup,
} from "./backup.ts";
import { openDb } from "./db.ts";
import { createStore } from "./store.ts";

const NOW = Date.UTC(2026, 9, 13, 14, 5);
let dir: string;
let open: Database[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cave-backup-"));
  open = [];
});
afterEach(() => {
  for (const db of open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

function seededDb() {
  const db = openDb(join(dir, "cave.db"));
  open.push(db);
  createStore(db).seedIfEmpty(seedDocs(), 1);
  return db;
}

test("names are UTC minutes and parse back", () => {
  expect(backupName(NOW)).toBe("cave-2026-10-13T1405.db");
  expect(backupTime("cave-2026-10-13T1405.db")).toBe(NOW);
  expect(backupTime("cave-2026-10-13T1405.db.failed")).toBeUndefined();
  expect(backupTime("notes.db")).toBeUndefined();
});

test("a backup of a database in use verifies and holds every doc", () => {
  const db = seededDb();
  const docs = createStore(db).docCount();
  const result = takeBackup(db, join(dir, "backups"), NOW);
  expect(result).toEqual({ ok: true, file: join(dir, "backups", backupName(NOW)), docs });
  expect(verifyBackup(result.file)).toEqual({ ok: true, docs });
});

test("a second backup in the same minute is refused, never overwritten", () => {
  const db = seededDb();
  expect(takeBackup(db, dir, NOW).ok).toBe(true);
  expect(takeBackup(db, dir, NOW)).toMatchObject({ ok: false });
});

test("a corrupt file fails verification", () => {
  const file = join(dir, "broken.db");
  writeFileSync(file, "not a database, just some bytes ".repeat(200));
  expect(verifyBackup(file).ok).toBe(false);
});

test("a copy that fails verification is renamed .failed", () => {
  const db = seededDb();
  const result = takeBackup(db, dir, NOW, () => ({ ok: false, error: "damaged" }));
  expect(result).toMatchObject({ ok: false, error: "damaged" });
  expect(existsSync(result.file)).toBe(false);
  expect(existsSync(`${result.file}.failed`)).toBe(true);
});

test("retention keeps the newest 14 and the newest of each of the last 12 months", () => {
  const day = 24 * 60 * 60 * 1000;
  const names = Array.from({ length: 400 }, (_, i) => backupName(NOW - i * day));
  const prunable = new Set(selectPrunable([...names, "notes.txt", "cave-old.db"], NOW));
  const kept = names.filter((n) => !prunable.has(n));

  expect(kept.slice(0, 14)).toEqual(names.slice(0, 14));
  // October and September are inside the newest 14; then the last day of each month back to November 2025.
  expect(kept.slice(14)).toEqual([
    "cave-2026-08-31T1405.db",
    "cave-2026-07-31T1405.db",
    "cave-2026-06-30T1405.db",
    "cave-2026-05-31T1405.db",
    "cave-2026-04-30T1405.db",
    "cave-2026-03-31T1405.db",
    "cave-2026-02-28T1405.db",
    "cave-2026-01-31T1405.db",
    "cave-2025-12-31T1405.db",
    "cave-2025-11-30T1405.db",
  ]);
  expect(prunable.has("notes.txt")).toBe(false);
  expect(prunable.has("cave-old.db")).toBe(false);
});

test("pruning deletes only backup files", () => {
  const day = 24 * 60 * 60 * 1000;
  for (let i = 0; i < 20; i++) writeFileSync(join(dir, backupName(NOW - i * day)), "");
  writeFileSync(join(dir, "keep-me.txt"), "");
  writeFileSync(join(dir, `${backupName(NOW - 30 * day)}.failed`), "");
  pruneBackups(dir, NOW);
  const left = readdirSync(dir);
  expect(left).toContain("keep-me.txt");
  expect(left).toContain(`${backupName(NOW - 30 * day)}.failed`);
  // The newest 14 already hold the newest of October and of September.
  expect(left.filter((n) => backupTime(n) !== undefined)).toHaveLength(14);
});

test("a backup is due with none or when the newest is a day old", () => {
  const db = seededDb();
  const backups = join(dir, "backups");
  expect(newestBackupAt(backups)).toBeUndefined();
  expect(backupIfDue(db, backups, NOW)?.ok).toBe(true);
  expect(newestBackupAt(backups)).toBe(NOW);
  expect(backupIfDue(db, backups, NOW + 23 * 60 * 60 * 1000)).toBeUndefined();
  expect(backupIfDue(db, backups, NOW + 24 * 60 * 60 * 1000)?.ok).toBe(true);
});
