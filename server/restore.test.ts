import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, uptime } from "node:os";
import { join } from "node:path";
import { seedDocs } from "../shared/seed.ts";
import { takeBackup } from "./backup.ts";
import { openDb } from "./db.ts";
import { lockPathOf } from "./lock.ts";
import { restoreBackup } from "./restore.ts";
import { createStore } from "./store.ts";

const NOW = Date.UTC(2026, 9, 13, 14, 5);
const lockOf = (pid: number) => JSON.stringify({ pid, bootAt: Date.now() - uptime() * 1000 });
let dir: string;
let dbPath: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cave-restore-"));
  dbPath = join(dir, "cave.db");
  db = openDb(dbPath);
  createStore(db).seedIfEmpty(seedDocs(), 1);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const task = (id: string, title: string, ms: number) => ({
  id,
  kind: "item" as const,
  collection: "tasks",
  data: { _title: title },
  stamps: { _title: `${ms}:0000:laptop` },
  actor: "user:laptop",
});

test("restore brings back the backup, keeps the old files and gives a new db_id", () => {
  const store = createStore(db);
  store.applyChanges([task("t1", "before the backup", NOW)], "user:laptop", NOW);
  const backup = takeBackup(db, join(dir, "backups"), NOW);
  if (!backup.ok) throw new Error(backup.error);
  store.applyChanges([task("t2", "after the backup", NOW + 1)], "user:laptop", NOW + 1);
  const oldId = store.dbId();
  db.close();

  const result = restoreBackup(backup.file, dbPath, NOW + 60_000);
  if (!result.ok) throw new Error(result.error);
  expect(result.dbId).not.toBe(oldId);
  expect(result.kept).toEqual([`${dbPath}.before-restore-2026-10-13T140600`]);

  db = openDb(dbPath);
  const restored = createStore(db);
  expect(restored.dbId()).toBe(result.dbId);
  expect(restored.get("t1")?.data._title).toBe("before the backup");
  expect(restored.get("t2")).toBeUndefined();
  expect(existsSync(lockPathOf(dbPath))).toBe(false);

  // The set-aside copy still holds the edit the backup lacks.
  const before = openDb(result.kept[0] as string);
  expect(createStore(before).get("t2")?.data._title).toBe("after the backup");
  before.close();
});

test("restore is refused while a live process holds the lock", () => {
  const backup = takeBackup(db, join(dir, "backups"), NOW);
  if (!backup.ok) throw new Error(backup.error);
  writeFileSync(lockPathOf(dbPath), lockOf(process.ppid));
  const result = restoreBackup(backup.file, dbPath, NOW);
  expect(result).toMatchObject({ ok: false });
  expect(!result.ok && result.error).toContain(`pid ${process.ppid}`);
  expect(readdirSync(dir).some((name) => name.includes("before-restore"))).toBe(false);
});

test("a file that does not verify is never restored", () => {
  const bad = join(dir, "bad.db");
  writeFileSync(bad, "garbage ".repeat(500));
  const result = restoreBackup(bad, dbPath, NOW);
  expect(result).toMatchObject({ ok: false });
  expect(readdirSync(dir).some((name) => name.includes("before-restore"))).toBe(false);
});

test("two restores in the same second both keep the file they replaced", () => {
  const backup = takeBackup(db, join(dir, "backups"), NOW);
  if (!backup.ok) throw new Error(backup.error);
  db.close();
  const first = restoreBackup(backup.file, dbPath, NOW);
  const second = restoreBackup(backup.file, dbPath, NOW);
  if (!first.ok || !second.ok) throw new Error("not restored");
  expect(first.kept).toEqual([`${dbPath}.before-restore-2026-10-13T140500`]);
  expect(second.kept).toEqual([`${dbPath}.before-restore-2026-10-13T140500-2`]);
  for (const file of [...first.kept, ...second.kept]) expect(existsSync(file)).toBe(true);
  db = openDb(dbPath);
});

test("a stale lock is reported and replaced", () => {
  const backup = takeBackup(db, join(dir, "backups"), NOW);
  if (!backup.ok) throw new Error(backup.error);
  db.close();
  // Far above any PID a test machine hands out.
  writeFileSync(lockPathOf(dbPath), lockOf(4194303));
  const result = restoreBackup(backup.file, dbPath, NOW);
  expect(result).toMatchObject({ ok: true, staleLock: 4194303 });
  expect(existsSync(lockPathOf(dbPath))).toBe(false);
  db = openDb(dbPath);
});
