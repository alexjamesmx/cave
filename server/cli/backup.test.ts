import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { seedDocs } from "../../shared/seed.ts";
import { backupName, PRE_DEPLOY_PATTERN, preDeployName } from "../backup.ts";
import { openDb } from "../db.ts";
import { createStore } from "../store.ts";

const dir = mkdtempSync(join(tmpdir(), "cave-backup-cli-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const dbPath = join(dir, "cave.db");
const db = openDb(dbPath);
createStore(db).seedIfEmpty(seedDocs(), 1);
db.close();

const cli = (args: string[]) =>
  Bun.spawnSync(["bun", "--no-env-file", join(import.meta.dir, "backup.ts"), ...args], {
    env: { ...process.env, CAVE_DB_PATH: dbPath, BACKUP_DIR: join(dir, "backups") },
    stdout: "pipe",
    stderr: "pipe",
  });

test("a pre-deploy backup lands in its directory, named after the commit, and prints the line cave-deploy reads", () => {
  const pre = join(dir, "backups", "pre-deploy");
  mkdirSync(pre, { recursive: true });
  const old = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 6; i++)
    writeFileSync(join(pre, preDeployName(old + i * 1000, "1111111")), "");
  writeFileSync(join(pre, backupName(old)), "");

  const result = cli(["--dir", pre, "--keep", "5", "--sha", "abc1234def"]);
  expect(result.exitCode).toBe(0);
  const line = /^Backup (.+): integrity ok, \d+ docs$/m.exec(result.stdout.toString());
  const file = line?.[1] ?? "";
  expect(dirname(file)).toBe(pre);
  expect(basename(file)).toMatch(PRE_DEPLOY_PATTERN);
  expect(basename(file).endsWith("-abc1234.db")).toBe(true);

  const left = readdirSync(pre);
  expect(left.filter((n) => PRE_DEPLOY_PATTERN.test(n))).toHaveLength(5);
  expect(left.some((n) => n.endsWith("-abc1234.db"))).toBe(true);
  expect(left).toContain(backupName(old));
  expect(readdirSync(join(dir, "backups"))).toEqual(["pre-deploy"]);
});

test("bad arguments stop before any backup", () => {
  const result = cli(["--sha", "main"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("--sha must be a commit id");
});
