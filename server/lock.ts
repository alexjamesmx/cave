import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { uptime } from "node:os";

/** The lock sits next to the database, so a server on a temp database never blocks the real one. */
export const lockPathOf = (dbPath: string) => `${dbPath}.lock`;

/** Two readings of the boot time differ by clock drift and rounding; a reboot moves it far more. */
const SAME_BOOT_MS = 2 * 60 * 1000;

type LockState =
  | { state: "free" }
  | { state: "held"; pid: number }
  | { state: "stale"; pid: number };

export interface LockDeps {
  alive: (pid: number) => boolean;
  /** When this machine booted, in ms since the epoch. */
  bootAt: () => number;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const systemDeps: LockDeps = { alive: isAlive, bootAt: () => Date.now() - uptime() * 1000 };

function parse(text: string): { pid: number; bootAt: number } | undefined {
  try {
    const value = JSON.parse(text) as { pid?: unknown; bootAt?: unknown };
    const { pid, bootAt } = value ?? {};
    if (
      typeof pid === "number" &&
      Number.isSafeInteger(pid) &&
      pid > 0 &&
      typeof bootAt === "number"
    ) {
      return { pid, bootAt };
    }
  } catch {}
  return undefined;
}

/**
 * A lock is held only by a live process started since this boot. After a crash and a reboot
 * the old PID is often reused by an unrelated process; its boot time tells them apart.
 * Unreadable locks, and the old plain-PID format, are stale.
 */
export function readLock(path: string, deps: LockDeps = systemDeps): LockState {
  if (!existsSync(path)) return { state: "free" };
  const lock = parse(readFileSync(path, "utf8"));
  if (!lock) return { state: "stale", pid: 0 };
  const sameBoot = Math.abs(lock.bootAt - deps.bootAt()) <= SAME_BOOT_MS;
  return sameBoot && deps.alive(lock.pid)
    ? { state: "held", pid: lock.pid }
    : { state: "stale", pid: lock.pid };
}

type Acquired = { ok: true; replaced?: number } | { ok: false; pid: number };

/**
 * Takes the lock for `pid`. The file is created exclusively, so of two processes starting
 * at once only one gets it; a stale lock is removed first and reported.
 */
export function acquireLock(
  path: string,
  pid = process.pid,
  deps: LockDeps = systemDeps,
): Acquired {
  const current = readLock(path, deps);
  if (current.state === "held") {
    return current.pid === pid ? { ok: true } : { ok: false, pid: current.pid };
  }
  if (current.state === "stale") rmSync(path, { force: true });
  try {
    writeFileSync(path, JSON.stringify({ pid, bootAt: deps.bootAt() }), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const winner = readLock(path, deps);
    return { ok: false, pid: winner.state === "free" ? 0 : winner.pid };
  }
  return current.state === "stale" ? { ok: true, replaced: current.pid } : { ok: true };
}

/** Removes the lock only if `pid` still owns it. */
export function releaseLock(path: string, pid = process.pid): void {
  if (!existsSync(path)) return;
  if (parse(readFileSync(path, "utf8"))?.pid === pid) rmSync(path);
}
