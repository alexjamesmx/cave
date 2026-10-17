import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, uptime } from "node:os";
import { basename, join } from "node:path";
import { seedDocs } from "../../shared/seed.ts";
import { takeBackup } from "../backup.ts";
import { openDb } from "../db.ts";
import { lockPathOf } from "../lock.ts";
import { createStore } from "../store.ts";
import { dailiesNewestFirst, pullDataRefusal, restoreNewest } from "./pull-data.ts";

let repo: string;
let backups: string;
let dbPath: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cave-repo-"));
  backups = join(repo, "data", "vps-backups");
  dbPath = join(repo, "data", "dev.db");
  mkdirSync(backups, { recursive: true });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

/** A real daily backup with `tasks` extra task items, as the VPS would take at `at`. */
function backupAt(at: number, tasks: number): string {
  const source = mkdtempSync(join(tmpdir(), "cave-vps-"));
  const db = openDb(join(source, "cave.db"));
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  store.applyChanges(
    Array.from({ length: tasks }, (_, i) => ({
      id: `t${i}`,
      kind: "item" as const,
      collection: "tasks",
      data: { _title: `Task ${i}` },
      stamps: { _title: `${at}:0000:phone` },
      actor: "user:phone",
    })),
    "user:phone",
    at,
  );
  const taken = takeBackup(db, backups, at);
  db.close();
  rmSync(source, { recursive: true, force: true });
  if (!taken.ok) throw new Error(taken.error);
  return basename(taken.file);
}

const docsIn = (path: string) => {
  const db = openDb(path);
  try {
    return (db.query("SELECT count(*) AS n FROM docs").get() as { n: number }).n;
  } finally {
    db.close();
  }
};

test("only daily backups count, newest first; pre-deploy and partial copies are left out", () => {
  expect(
    dailiesNewestFirst([
      "cave-2026-10-15T0358.db",
      "cave-2026-10-17T020240-72e6d19.db",
      "cave-2026-10-16T0358.db",
      "cave-2026-10-17T0400.db.part",
      "cave-2026-10-14T0358.db.failed",
    ]),
  ).toEqual(["cave-2026-10-16T0358.db", "cave-2026-10-15T0358.db"]);
});

test("refuses production, a path outside data/, and a database a server holds", () => {
  expect(pullDataRefusal(dbPath, "production", repo)).toContain("CAVE_ENV=production");
  expect(pullDataRefusal(join(repo, "dev.db"), "dev", repo)).toContain("is not inside");
  expect(pullDataRefusal(join(repo, "data", "..", "x.db"), "dev", repo)).toContain("is not inside");
  expect(pullDataRefusal(join(repo, "data"), "dev", repo)).toContain("is not inside");
  expect(pullDataRefusal(dbPath, "dev", repo)).toBeUndefined();
  writeFileSync(
    lockPathOf(dbPath),
    JSON.stringify({ pid: process.pid, bootAt: Date.now() - uptime() * 1000 }),
  );
  expect(pullDataRefusal(dbPath, "dev", repo)).toContain(`pid ${process.pid}`);
  const result = restoreNewest({ dir: backups, dbPath, env: "dev", repoRoot: repo, now: 1 });
  expect(result.ok).toBe(false);
  expect(existsSync(dbPath)).toBe(false);
});

test("the newest daily that verifies replaces dev.db; the old one becomes the only .prev", () => {
  const day = (d: number) => Date.UTC(2026, 9, d, 3, 58);
  backupAt(day(15), 1);
  const newest = backupAt(day(16), 3);
  writeFileSync(join(backups, "cave-2026-10-17T0358.db"), "not a database ".repeat(100));

  const first = restoreNewest({ dir: backups, dbPath, env: "dev", repoRoot: repo, now: day(17) });
  if (!first.ok) throw new Error(first.error);
  expect([first.backup, first.at, first.prev]).toEqual([newest, day(16), undefined]);
  expect(first.docs).toBe(docsIn(dbPath));

  // Something written locally since, then a second pull: one .prev, holding that copy.
  const db = openDb(dbPath);
  createStore(db).applyChanges(
    [
      {
        id: "local",
        kind: "item",
        collection: "tasks",
        data: { _title: "x" },
        stamps: { _title: `${day(17)}:0000:laptop` },
        actor: "user:laptop",
      },
    ],
    "user:laptop",
    day(17),
  );
  db.close();
  const second = restoreNewest({ dir: backups, dbPath, env: "dev", repoRoot: repo, now: day(18) });
  if (!second.ok) throw new Error(second.error);
  expect(second.prev).toBe(`${dbPath}.prev`);
  expect(docsIn(`${dbPath}.prev`)).toBe(first.docs + 1);
  expect(docsIn(dbPath)).toBe(first.docs);
  expect(
    readdirSync(join(repo, "data"))
      .filter((n) => n.startsWith("dev.db"))
      .sort(),
  ).toEqual(["dev.db", "dev.db.prev"]);
});

test("nothing changes when no daily verifies", () => {
  writeFileSync(join(backups, "cave-2026-10-17T0358.db"), "not a database ".repeat(100));
  writeFileSync(dbPath, "");
  const result = restoreNewest({ dir: backups, dbPath, env: "dev", repoRoot: repo, now: 1 });
  expect(result).toEqual({ ok: false, error: `no daily backup in ${backups} verifies` });
  expect(existsSync(`${dbPath}.prev`)).toBe(false);
});
