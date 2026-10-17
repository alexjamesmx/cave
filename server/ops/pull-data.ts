import { Database } from "bun:sqlite";
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { BACKUP_PATTERN, backupTime, type Verified, verifyBackup } from "../backup.ts";
import type { CaveEnv } from "../env.ts";
import { lockPathOf, readLock } from "../lock.ts";
import { restoreBackup } from "../restore.ts";

/** Why the laptop's dev database must not be replaced, or `undefined` when it may. */
export function pullDataRefusal(
  dbPath: string,
  env: CaveEnv,
  repoRoot: string,
): string | undefined {
  if (env === "production") return "CAVE_ENV=production; pull-data only replaces a dev copy";
  const data = resolve(repoRoot, "data");
  const target = resolve(dbPath);
  const inside = relative(data, target);
  // Another drive on Windows gives an absolute relative path.
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside))
    return `${target} is not inside ${data}; pull-data only replaces a database there`;
  const lock = readLock(lockPathOf(target));
  if (lock.state === "held")
    return `a Cave server (pid ${lock.pid}) is using ${target}; stop it first`;
  return undefined;
}

/** Daily backups in `names`, newest first; pre-deploy and partial copies are left out. */
export const dailiesNewestFirst = (names: string[]) =>
  names
    .filter((n) => BACKUP_PATTERN.test(n))
    .sort()
    .reverse();

const SUFFIXES = ["", "-wal", "-shm"];

/**
 * Moves the current database to `<db>.prev`, replacing the previous one: one step of undo,
 * not a growing pile of copies of real data. The -wal is folded in first so `.prev` is whole.
 */
export function keepAsPrev(dbPath: string): string | undefined {
  if (!existsSync(dbPath)) return undefined;
  const db = new Database(dbPath);
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
  const prev = `${dbPath}.prev`;
  for (const suffix of SUFFIXES) rmSync(prev + suffix, { force: true });
  for (const suffix of SUFFIXES)
    if (existsSync(dbPath + suffix)) renameSync(dbPath + suffix, prev + suffix);
  return prev;
}

export type PulledData =
  | { ok: true; backup: string; at: number; docs: number; prev: string | undefined }
  | { ok: false; error: string };

export interface PullDataOptions {
  dir: string;
  dbPath: string;
  env: CaveEnv;
  repoRoot: string;
  now: number;
  verify?: (file: string) => Verified;
}

/**
 * Replaces the dev database with the newest daily backup in `dir` that verifies, through the
 * same restore `bun run restore` uses (so the copy gets its own db_id). Nothing changes when
 * it refuses or when no backup verifies.
 */
export function restoreNewest(o: PullDataOptions): PulledData {
  const refusal = pullDataRefusal(o.dbPath, o.env, o.repoRoot);
  if (refusal) return { ok: false, error: refusal };
  const verify = o.verify ?? verifyBackup;
  const backup = dailiesNewestFirst(existsSync(o.dir) ? readdirSync(o.dir) : []).find(
    (name) => verify(join(o.dir, name)).ok,
  );
  if (!backup) return { ok: false, error: `no daily backup in ${o.dir} verifies` };
  const prev = keepAsPrev(o.dbPath);
  const restored = restoreBackup(join(o.dir, backup), o.dbPath, o.now);
  if (!restored.ok)
    return {
      ok: false,
      error: `${restored.error}${prev ? ` (the previous database is ${prev})` : ""}`,
    };
  return { ok: true, backup, at: backupTime(backup) as number, docs: restored.docs, prev };
}
