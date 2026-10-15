import { expect, test } from "bun:test";
import { parseBackupArgs } from "./backup-args.ts";

test("no arguments is the daily backup, as before", () => {
  expect(parseBackupArgs([])).toEqual({ ok: true, value: {} });
});

test("a pre-deploy backup names its directory, keep count and commit", () => {
  expect(
    parseBackupArgs([
      "--dir",
      "/var/lib/cave/backups/pre-deploy",
      "--keep",
      "5",
      "--sha",
      "abc1234",
    ]),
  ).toEqual({
    ok: true,
    value: { dir: "/var/lib/cave/backups/pre-deploy", keep: 5, sha: "abc1234" },
  });
});

test("bad values and unknown flags are refused", () => {
  for (const argv of [
    ["--keep", "0"],
    ["--keep", "2.5"],
    ["--keep"],
    ["--sha", "main"],
    ["--sha", "ABC1234"],
    ["--dir", "--keep"],
    ["--force", "x"],
  ]) {
    expect(parseBackupArgs(argv).ok).toBe(false);
  }
});
