import { Database } from "bun:sqlite";
import { constants, copyFileSync, existsSync, renameSync } from "node:fs";
import { verifyBackup } from "./backup.ts";
import { openDb } from "./db.ts";
import { acquireLock, lockPathOf, releaseLock } from "./lock.ts";

export type Restored =
  | { ok: true; docs: number; dbId: string; kept: string[] }
  | { ok: false; error: string };

const stampOf = (now: number) => new Date(now).toISOString().slice(0, 19).replace(/:/g, "");

/**
 * Replaces the database at `dbPath` with a verified backup. The current files are renamed
 * `<name>.before-restore-<time>`, never deleted. The restored copy gets a new `db_id`, so
 * devices notice and push back what the backup lacks.
 */
export function restoreBackup(file: string, dbPath: string, now: number): Restored {
  const verified = verifyBackup(file);
  if (!verified.ok) return { ok: false, error: `backup does not verify: ${verified.error}` };

  const lock = lockPathOf(dbPath);
  const acquired = acquireLock(lock);
  if (!acquired.ok) {
    return {
      ok: false,
      error: `a Cave server (pid ${acquired.pid}) is using ${dbPath}; stop it first. If none is running, delete ${lock}`,
    };
  }
  try {
    const kept = existsSync(dbPath) ? setAside(dbPath, now) : [];
    copyFileSync(file, dbPath, constants.COPYFILE_EXCL);
    const db = openDb(dbPath);
    try {
      const dbId = crypto.randomUUID().replaceAll("-", "");
      db.run("UPDATE meta SET value = ? WHERE key = 'db_id'", [dbId]);
      return { ok: true, docs: verified.docs, dbId, kept };
    } finally {
      db.close();
    }
  } finally {
    releaseLock(lock);
  }
}

// A crash can leave committed pages in the -wal file; folding them in first makes the
// renamed copy whole, and no stale -wal is left beside the restored file.
function setAside(dbPath: string, now: number): string[] {
  const current = new Database(dbPath);
  try {
    current.run("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    current.close();
  }
  const target = `${dbPath}.before-restore-${stampOf(now)}`;
  const kept: string[] = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    if (!existsSync(dbPath + suffix)) continue;
    renameSync(dbPath + suffix, target + suffix);
    kept.push(target + suffix);
  }
  return kept;
}
