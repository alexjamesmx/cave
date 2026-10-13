import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, isAlive, lockPathOf, readLock, releaseLock } from "./lock.ts";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cave-lock-"));
  path = lockPathOf(join(dir, "cave.db"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("this process is alive; a process that has exited is not", async () => {
  expect(isAlive(process.pid)).toBe(true);
  const child = Bun.spawn([process.execPath, "--version"], { stdout: "ignore" });
  await child.exited;
  expect(isAlive(child.pid)).toBe(false);
});

test("a free lock is taken and released", () => {
  expect(readLock(path)).toEqual({ state: "free" });
  expect(acquireLock(path, 4242, () => true)).toEqual({ ok: true });
  expect(readFileSync(path, "utf8")).toBe("4242");
  releaseLock(path, 4242);
  expect(existsSync(path)).toBe(false);
});

test("a lock held by a live process is refused", () => {
  writeFileSync(path, "4242");
  expect(readLock(path, () => true)).toEqual({ state: "held", pid: 4242 });
  expect(acquireLock(path, 7, () => true)).toEqual({ ok: false, pid: 4242 });
  expect(readFileSync(path, "utf8")).toBe("4242");
});

test("a stale lock is reported and replaced", () => {
  writeFileSync(path, "4242");
  expect(readLock(path, () => false)).toEqual({ state: "stale", pid: 4242 });
  expect(acquireLock(path, 7, () => false)).toEqual({ ok: true, replaced: 4242 });
  expect(readFileSync(path, "utf8")).toBe("7");
});

test("releasing leaves another process's lock alone", () => {
  writeFileSync(path, "4242");
  releaseLock(path, 7);
  expect(existsSync(path)).toBe(true);
});
