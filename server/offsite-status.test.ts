import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db.ts";
import { createOffsiteJob } from "./jobs/offsite-job.ts";
import { createSentLog, type Notifier } from "./notify/notifier.ts";
import type { Notification } from "./notify/types.ts";
import { type OffsiteRun, offsiteAlert, readOffsiteStatus, STALE_MS } from "./offsite-status.ts";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const run = (over: Partial<OffsiteRun> = {}): OffsiteRun => ({
  at: iso(NOW - 3_600_000),
  ok: true,
  snapshot: "01ebed8a",
  docs: 233,
  file: "cave-2026-10-16T0300.db",
  error: "",
  ...over,
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function file(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cave-offsite-"));
  dirs.push(dir);
  const path = join(dir, "status.json");
  writeFileSync(path, content);
  return path;
}

describe("readOffsiteStatus", () => {
  test("reads what cave-offsite writes", () => {
    const backup = { ...run(), lastOkAt: iso(NOW - 3_600_000) };
    const check = run({ ok: false, error: "the restored copy does not verify", docs: null });
    expect(readOffsiteStatus(file(JSON.stringify({ backup, check })))).toEqual({ backup, check });
    expect(readOffsiteStatus(file('{"backup":null,"check":null}'))).toEqual({
      backup: null,
      check: null,
    });
  });

  test("no path or no file is not set up", () => {
    expect(readOffsiteStatus(undefined)).toBeNull();
    expect(readOffsiteStatus(join(tmpdir(), "no-such-dir-cave", "status.json"))).toBeNull();
  });

  test("a broken file, or a run with an odd field, is set up with nothing known", () => {
    expect(readOffsiteStatus(file("{not json"))).toEqual({ backup: null, check: null });
    for (const bad of [
      { ok: "yes" },
      { at: "yesterday" },
      { snapshot: "ZZZ" },
      { docs: -1 },
      { file: "/var/lib/cave/backups/x.db" },
      { error: "s3:https://acct.r2.cloudflarestorage.com/cave-backups" },
      { lastOkAt: "soon" },
    ])
      expect(readOffsiteStatus(file(JSON.stringify({ backup: { ...run(), ...bad } })))).toEqual({
        backup: null,
        check: null,
      });
  });
});

describe("offsiteAlert", () => {
  test("fresh: nothing", () => {
    expect(offsiteAlert({ backup: run(), check: run() }, NOW)).toBeUndefined();
    expect(offsiteAlert({ backup: run(), check: null }, NOW)).toBeUndefined();
  });

  test("not set up: nothing", () => {
    expect(offsiteAlert(null, NOW)).toBeUndefined();
  });

  test("stale: the last success is older than 48 hours, or there never was one", () => {
    const old = iso(NOW - STALE_MS - 60_000);
    expect(offsiteAlert({ backup: run({ at: old }), check: null }, NOW)).toEqual({
      key: `offsite:stale:${old}`,
      title: "Off-box backup is more than 48 hours old",
    });
    // A failed run keeps the last success: it is that one that counts.
    const failedRecently = run({ ok: false, error: "restic backup failed", lastOkAt: old });
    expect(offsiteAlert({ backup: failedRecently, check: null }, NOW)?.key).toBe(
      `offsite:stale:${old}`,
    );
    const recent = iso(NOW - 3_600_000);
    expect(
      offsiteAlert({ backup: run({ ok: false, error: "x", lastOkAt: recent }), check: null }, NOW),
    ).toBeUndefined();
    expect(offsiteAlert({ backup: null, check: null }, NOW)?.key).toBe("offsite:stale:never");
  });

  test("failed: the last check failed, even with a fresh backup", () => {
    const check = run({ ok: false, error: "restic check failed" });
    expect(offsiteAlert({ backup: run(), check }, NOW)).toEqual({
      key: `offsite:check:${check.at}`,
      title: "Off-box backup check failed",
    });
  });
});

describe("the hourly job", () => {
  function job(path: string | undefined) {
    const sent: Notification[] = [];
    const notifier: Notifier = {
      statuses: () => [],
      notify: async (n) => {
        sent.push(n);
        return { delivered: 1, failed: 0 };
      },
    };
    const j = createOffsiteJob({
      statusPath: path,
      notifier,
      sent: createSentLog(openDb(":memory:")),
    });
    return { sent, tick: (now = NOW) => j.run({ now }) };
  }

  test("a forced stale status raises one notification, titles only, opening /system", async () => {
    const old = iso(NOW - STALE_MS - 60_000);
    const j = job(file(JSON.stringify({ backup: run({ at: old }), check: null })));
    expect((await j.tick()).didSomething).toBe(true);
    expect((await j.tick(NOW + 3_600_000)).summary).toBe("already told");
    expect(j.sent).toEqual([
      {
        key: `offsite:stale:${old}`,
        kind: "message",
        title: "Off-box backup is more than 48 hours old",
        details: [],
        path: "/settings/system",
      },
    ]);
  });

  test("not set up and fresh send nothing", async () => {
    const missing = job(undefined);
    expect((await missing.tick()).summary).toBe("not set up");
    const fresh = job(file(JSON.stringify({ backup: run(), check: run() })));
    expect((await fresh.tick()).summary).toBe("fresh");
    expect([...missing.sent, ...fresh.sent]).toEqual([]);
  });
});
