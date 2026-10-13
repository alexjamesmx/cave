import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, isAlive, type LockDeps, lockPathOf, readLock, releaseLock } from "./lock.ts";

const BOOT = Date.UTC(2026, 9, 13, 8, 0);
const DAY = 24 * 60 * 60 * 1000;
let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cave-lock-"));
  path = lockPathOf(join(dir, "cave.db"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const deps = (alive: boolean, bootAt = BOOT): LockDeps => ({
  alive: () => alive,
  bootAt: () => bootAt,
});
const lockOf = (pid: number, bootAt = BOOT) => JSON.stringify({ pid, bootAt });

test("this process is alive; a process that has exited is not", async () => {
  expect(isAlive(process.pid)).toBe(true);
  const child = Bun.spawn([process.execPath, "--version"], { stdout: "ignore" });
  await child.exited;
  expect(isAlive(child.pid)).toBe(false);
});

test("a free lock is taken with this boot's time and released", () => {
  expect(readLock(path, deps(true))).toEqual({ state: "free" });
  expect(acquireLock(path, 4242, deps(true))).toEqual({ ok: true });
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ pid: 4242, bootAt: BOOT });
  releaseLock(path, 4242);
  expect(existsSync(path)).toBe(false);
});

test("a live process from this boot holds the lock", () => {
  writeFileSync(path, lockOf(4242, BOOT + 30_000));
  expect(readLock(path, deps(true))).toEqual({ state: "held", pid: 4242 });
  expect(acquireLock(path, 7, deps(true))).toEqual({ ok: false, pid: 4242 });
  expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(4242);
});

test("a lock from an earlier boot is stale even when its PID is alive again", () => {
  writeFileSync(path, lockOf(4242, BOOT - DAY));
  expect(readLock(path, deps(true))).toEqual({ state: "stale", pid: 4242 });
  expect(acquireLock(path, 7, deps(true))).toEqual({ ok: true, replaced: 4242 });
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ pid: 7, bootAt: BOOT });
});

test("a lock in the old plain-PID format, or unreadable, is stale", () => {
  writeFileSync(path, "4242");
  expect(readLock(path, deps(true))).toEqual({ state: "stale", pid: 0 });
  writeFileSync(path, "{not json");
  expect(readLock(path, deps(true))).toEqual({ state: "stale", pid: 0 });
  expect(acquireLock(path, 7, deps(true))).toEqual({ ok: true, replaced: 0 });
});

test("a dead PID from this boot is stale", () => {
  writeFileSync(path, lockOf(4242));
  expect(acquireLock(path, 7, deps(false))).toEqual({ ok: true, replaced: 4242 });
});

test("if another process creates the lock between the check and the write, it wins", () => {
  // The write takes this boot's time just before creating the file, after the lock looked free.
  const racing: LockDeps = {
    alive: () => true,
    bootAt: () => {
      if (!existsSync(path)) writeFileSync(path, lockOf(99));
      return BOOT;
    },
  };
  expect(acquireLock(path, 7, racing)).toEqual({ ok: false, pid: 99 });
  expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(99);
});

test("two processes taking a free lock at once: exactly one wins", async () => {
  const script = `
    const { acquireLock } = await import(${JSON.stringify(join(import.meta.dir, "lock.ts"))});
    console.log(JSON.stringify(acquireLock(process.argv[1])));
    await Bun.sleep(1500);
  `;
  const run = () =>
    Bun.spawn([process.execPath, "-e", script, path], { stdout: "pipe", stderr: "inherit" });
  const children = [run(), run()];
  const results = await Promise.all(
    children.map(async (child) => JSON.parse(await new Response(child.stdout).text())),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok)).toHaveLength(1);
});

test("releasing leaves another process's lock alone", () => {
  writeFileSync(path, lockOf(4242));
  releaseLock(path, 7);
  expect(existsSync(path)).toBe(true);
});
