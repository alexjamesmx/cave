import { expect, test } from "bun:test";
import { envBadge } from "./env-badge.ts";

test("DEV and TEST show; production and anything unknown show nothing", () => {
  expect(envBadge("dev")).toBe("DEV");
  expect(envBadge("test")).toBe("TEST");
  expect(envBadge("production")).toBeUndefined();
  expect(envBadge(undefined)).toBeUndefined();
  expect(envBadge("staging")).toBeUndefined();
});
