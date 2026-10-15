import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeployStatus, readDeployStatus } from "./deploy-status.ts";

const dir = mkdtempSync(join(tmpdir(), "cave-deploy-status-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const A = "a".repeat(40);
const B = "b".repeat(40);
const file = (name: string, body: string) => {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
};

test("unset or missing is null", () => {
  expect(readDeployStatus(undefined)).toBeNull();
  expect(readDeployStatus(join(dir, "missing.json"))).toBeNull();
});

test("a file cave-deploy wrote is read as is", () => {
  const failed: DeployStatus = {
    sha: B,
    result: "failed",
    step: "test",
    at: "2026-10-14T12:03:00Z",
    running: A,
  };
  expect(readDeployStatus(file("failed.json", `${JSON.stringify(failed)}\n`))).toEqual(failed);
  const deployed: DeployStatus = {
    sha: A,
    result: "deployed",
    at: "2026-10-14T12:03:00Z",
    running: A,
  };
  expect(readDeployStatus(file("deployed.json", JSON.stringify(deployed)))).toEqual(deployed);
});

test("a malformed file is null", () => {
  const good = { sha: A, result: "deployed", at: "2026-10-14T12:03:00Z", running: A };
  for (const body of [
    "",
    "not json",
    "null",
    "[]",
    JSON.stringify({ ...good, sha: "abc1234" }),
    JSON.stringify({ ...good, result: "maybe" }),
    JSON.stringify({ ...good, at: "yesterday" }),
    JSON.stringify({ ...good, running: 3 }),
    JSON.stringify({ ...good, step: "<script>" }),
  ]) {
    expect(readDeployStatus(file("bad.json", body))).toBeNull();
  }
});
