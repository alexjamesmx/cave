import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

/** `cave-2026-10-13T1405.db`, in UTC so names sort in time order across DST changes. */
export const BACKUP_PATTERN = /^cave-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})\.db$/;

const KEEP_NEWEST = 14;
const KEEP_MONTHS = 12;
export const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;

export function backupName(now: number): string {
  const iso = new Date(now).toISOString();
  return `cave-${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}.db`;
}

/**
 * `cave-2026-10-14T120305-abc1234.db`: taken by `cave-deploy` right before it switches to the
 * named commit. Seconds keep two deploys in one minute apart; the pattern never matches a daily
 * name, so the two kinds never prune each other.
 */
export const PRE_DEPLOY_PATTERN = /^cave-\d{4}-\d{2}-\d{2}T\d{6}-[0-9a-f]{7}\.db$/;

export function preDeployName(now: number, sha: string): string {
  const iso = new Date(now).toISOString();
  const stamp = `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
  return `cave-${stamp}-${sha.slice(0, 7)}.db`;
}

export function backupTime(name: string): number | undefined {
  const m = BACKUP_PATTERN.exec(name);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return Date.UTC(y, mo - 1, d, h, mi);
}

export type Verified = { ok: true; docs: number } | { ok: false; error: string };

/** A backup counts only if SQLite finds it intact and its docs table can be read. */
export function verifyBackup(file: string): Verified {
  let copy: Database | undefined;
  try {
    copy = new Database(file, { readonly: true });
    const rows = copy.query<{ integrity_check: string }, []>("PRAGMA integrity_check").all();
    if (rows.length !== 1 || rows[0]?.integrity_check !== "ok") {
      return {
        ok: false,
        error: `integrity_check: ${rows.map((r) => r.integrity_check).join("; ")}`,
      };
    }
    const docs = copy.query<{ n: number }, []>("SELECT count(*) AS n FROM docs").get()?.n ?? 0;
    return { ok: true, docs };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  } finally {
    copy?.close();
  }
}

export type BackupResult =
  | { ok: true; file: string; docs: number }
  | { ok: false; file: string; error: string };

const countDocs = (db: Database) =>
  db.query<{ n: number }, []>("SELECT count(*) AS n FROM docs").get()?.n ?? 0;

/**
 * Writes a verified snapshot of `db` into `dir` while other connections may keep writing.
 * Docs are never removed, so a copy taken between two counts holds a count between them.
 * A copy that fails verification is renamed `*.failed` and kept for inspection.
 */
export function takeBackup(
  db: Database,
  dir: string,
  now: number,
  verify: (file: string) => Verified = verifyBackup,
  name: string = backupName(now),
): BackupResult {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  if (existsSync(file)) return { ok: false, file, error: "a backup with this name already exists" };

  let error: string;
  try {
    const before = countDocs(db);
    // `run` finalizes its statement; a kept `prepare` would hold the file open after close.
    db.run("VACUUM INTO ?", [file]);
    const after = countDocs(db);
    const verified = verify(file);
    if (verified.ok && verified.docs >= before && verified.docs <= after) {
      return { ok: true, file, docs: verified.docs };
    }
    error = verified.ok
      ? `copy holds ${verified.docs} docs, source held ${before} to ${after}`
      : verified.error;
  } catch (thrown) {
    error = (thrown as Error).message;
  }
  if (existsSync(file)) renameSync(file, `${file}.failed`);
  return { ok: false, file, error };
}

/**
 * Backups to delete: everything except the newest 14 and the newest of each of the last 12
 * calendar months (UTC). Names that are not backups are never returned.
 */
export function selectPrunable(names: string[], now: number): string[] {
  const backups = names
    .flatMap((name) => {
      const at = backupTime(name);
      return at === undefined ? [] : [{ name, at }];
    })
    .sort((a, b) => b.at - a.at);
  const keep = new Set(backups.slice(0, KEEP_NEWEST).map((b) => b.name));
  const today = new Date(now);
  for (let back = 0; back < KEEP_MONTHS; back++) {
    const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    const key = month.toISOString().slice(0, 7);
    const newest = backups.find((b) => new Date(b.at).toISOString().slice(0, 7) === key);
    if (newest) keep.add(newest.name);
  }
  return backups.filter((b) => !keep.has(b.name)).map((b) => b.name);
}

const backupNames = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);

export function pruneBackups(dir: string, now: number): string[] {
  const prunable = selectPrunable(backupNames(dir), now);
  for (const name of prunable) rmSync(join(dir, name));
  return prunable;
}

/** Names matching `pattern` beyond the newest `keep`; the names sort in time order. */
export function selectBeyondNewest(names: string[], pattern: RegExp, keep: number): string[] {
  return names
    .filter((name) => pattern.test(name))
    .sort()
    .reverse()
    .slice(keep);
}

export function pruneBeyondNewest(dir: string, pattern: RegExp, keep: number): string[] {
  const prunable = selectBeyondNewest(backupNames(dir), pattern, keep);
  for (const name of prunable) rmSync(join(dir, name));
  return prunable;
}

export function newestBackupAt(dir: string): number | undefined {
  const times = backupNames(dir).flatMap((name) => backupTime(name) ?? []);
  return times.length > 0 ? Math.max(...times) : undefined;
}

/** Takes a backup when the newest is older than a day (or there is none), then prunes. */
export function backupIfDue(db: Database, dir: string, now: number): BackupResult | undefined {
  const newest = newestBackupAt(dir);
  if (newest !== undefined && now - newest < BACKUP_EVERY_MS) return undefined;
  const result = takeBackup(db, dir, now);
  if (result.ok) pruneBackups(dir, now);
  return result;
}
