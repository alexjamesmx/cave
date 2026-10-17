import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const cli = (file?: string) =>
  Bun.spawnSync(["bun", join(import.meta.dir, "verify-backup-cli.ts"), ...(file ? [file] : [])], {
    stdout: "pipe",
    stderr: "pipe",
  });

test("verify-backup prints the line cave-offsite reads, and fails on a broken or missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "cave-verify-"));
  dirs.push(dir);
  const good = join(dir, "cave-2026-10-16T0300.db");
  const db = new Database(good, { create: true });
  db.run("CREATE TABLE docs (id TEXT)");
  for (const id of ["a", "b", "c"]) db.run("INSERT INTO docs VALUES (?)", [id]);
  db.close();
  const ok = cli(good);
  expect(ok.success).toBe(true);
  expect(ok.stdout.toString().trim()).toBe("cave-2026-10-16T0300.db: integrity ok, 3 docs");

  const broken = join(dir, "broken.db");
  writeFileSync(broken, "not a database");
  expect(cli(broken).success).toBe(false);
  expect(cli(join(dir, "missing.db")).success).toBe(false);
  expect(cli().stderr.toString()).toContain("Usage: bun run verify-backup");
});
