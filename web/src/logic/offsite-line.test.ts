import { expect, test } from "bun:test";
import { offsiteLines } from "./offsite-line.ts";

const t = (iso: string) => iso.slice(5, 10);
const run = {
  at: "2026-10-16T05:15:00Z",
  ok: true,
  snapshot: "01ebed8a",
  docs: 233,
  file: "cave-2026-10-16T0300.db",
  error: "",
};

test("not set up, nothing yet, ok and failed read plainly", () => {
  expect(offsiteLines(null, t)).toEqual({ backup: "Not set up", check: "Not set up" });
  expect(offsiteLines({ backup: null, check: null }, t)).toEqual({
    backup: "None yet",
    check: "None yet",
  });
  expect(offsiteLines({ backup: run, check: run }, t)).toEqual({
    backup: "Snapshot 01ebed8a · 233 docs · 10-16",
    check: "Passed · 233 docs restored · 10-16",
  });
  const failed = {
    ...run,
    ok: false,
    error: "restic backup failed",
    lastOkAt: "2026-10-14T05:15:00Z",
  };
  expect(
    offsiteLines({ backup: failed, check: { ...run, ok: false, error: "restic check failed" } }, t),
  ).toEqual({
    backup: "Failed: restic backup failed · 10-16 · last ok 10-14",
    check: "Failed: restic check failed · 10-16",
  });
});
