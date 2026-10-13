import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

/** The lock sits next to the database, so a server on a temp database never blocks the real one. */
export const lockPathOf = (dbPath: string) => `${dbPath}.lock`;

export type LockState =
  | { state: "free" }
  | { state: "held"; pid: number }
  | { state: "stale"; pid: number };

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readLock(path: string, alive = isAlive): LockState {
  if (!existsSync(path)) return { state: "free" };
  const pid = Number(readFileSync(path, "utf8").trim());
  if (!Number.isSafeInteger(pid) || pid <= 0) return { state: "stale", pid: 0 };
  return alive(pid) ? { state: "held", pid } : { state: "stale", pid };
}

export type Acquired = { ok: true; replaced?: number } | { ok: false; pid: number };

/** Takes the lock for `pid`; a lock whose process is gone is replaced and reported. */
export function acquireLock(path: string, pid = process.pid, alive = isAlive): Acquired {
  const current = readLock(path, alive);
  if (current.state === "held" && current.pid !== pid) return { ok: false, pid: current.pid };
  writeFileSync(path, String(pid));
  return current.state === "stale" ? { ok: true, replaced: current.pid } : { ok: true };
}

/** Removes the lock only if `pid` still owns it. */
export function releaseLock(path: string, pid = process.pid): void {
  if (existsSync(path) && readFileSync(path, "utf8").trim() === String(pid)) rmSync(path);
}
