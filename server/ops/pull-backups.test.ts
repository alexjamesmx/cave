import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDocs } from "../../shared/seed.ts";
import { takeBackup } from "../backup.ts";
import { openDb } from "../db.ts";
import { createStore } from "../store.ts";
import { missingBackups, pullBackups } from "./pull-backups.ts";

let dir: string;
let source: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cave-pull-"));
  source = mkdtempSync(join(tmpdir(), "cave-vps-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(source, { recursive: true, force: true });
});

test("only backups the laptop lacks are pulled; other names are ignored", () => {
  const remote = [
    "cave-2026-10-13T1405.db",
    "cave-2026-10-14T1405.db\r",
    "cave-2026-10-12T1405.db.failed",
    "notes.txt",
    "",
  ];
  expect(missingBackups(remote, ["cave-2026-10-13T1405.db"])).toEqual(["cave-2026-10-14T1405.db"]);
});

test("a pulled copy is verified before it takes its real name", () => {
  const db = openDb(join(source, "cave.db"));
  createStore(db).seedIfEmpty(seedDocs(), 1);
  const backup = takeBackup(db, source, Date.UTC(2026, 9, 14, 14, 5));
  db.close();
  if (!backup.ok) throw new Error(backup.error);
  writeFileSync(join(source, "cave-2026-10-13T1405.db"), "not a database ".repeat(100));

  const results = pullBackups({
    remote: readdirSync(source),
    dir,
    copy: (name, to) => {
      copyFileSync(join(source, name), to);
      return true;
    },
  });

  expect(results.map((r) => [r.name, r.ok])).toEqual([
    ["cave-2026-10-13T1405.db", false],
    ["cave-2026-10-14T1405.db", true],
  ]);
  expect(readdirSync(dir).sort()).toEqual([
    "cave-2026-10-13T1405.db.failed",
    "cave-2026-10-14T1405.db",
  ]);
  // The VPS side is only read.
  expect(existsSync(join(source, "cave-2026-10-14T1405.db"))).toBe(true);
});

test("a copy that does not complete leaves no backup behind under its real name", () => {
  const results = pullBackups({
    remote: ["cave-2026-10-14T1405.db"],
    dir,
    copy: () => false,
  });
  expect(results).toEqual([{ name: "cave-2026-10-14T1405.db", ok: false, error: "copy failed" }]);
  expect(readdirSync(dir)).toEqual([]);
});
