import { expect, test } from "bun:test";
import { deployLine } from "./deploy-line.ts";

const A = "a".repeat(40);
const B = "b".repeat(40);
const at = "2026-10-14T12:03:00Z";
const time = () => "12:03";

test("a healthy deploy names the running commit and when", () => {
  expect(deployLine({ sha: A, result: "deployed", at, running: A }, time)).toEqual([
    "Running ",
    { commit: A },
    ", deployed 12:03",
  ]);
});

test("a failed deploy names the commit, the step and what still runs", () => {
  expect(deployLine({ sha: B, result: "failed", step: "test", at, running: A }, time)).toEqual([
    "Last deploy of ",
    { commit: B },
    " failed at test; still running ",
    { commit: A },
  ]);
});

test("a rollback names the commit it left", () => {
  expect(deployLine({ sha: B, result: "rolled-back", at, running: A }, time)).toEqual([
    "Rolled back from ",
    { commit: B },
    "; running ",
    { commit: A },
  ]);
});
