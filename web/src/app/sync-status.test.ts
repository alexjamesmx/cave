import { expect, test } from "bun:test";
import { ClockAheadError } from "../store/sync.ts";
import { failedStatus } from "./sync-status.ts";

test("classifies sync failures for the owner", () => {
  const ahead = new ClockAheadError(1_000, 3_601_000, 3_601_000);
  expect(failedStatus(ahead, 5, true)).toEqual({
    phase: "clock-ahead",
    lastSyncedAt: 5,
    error: ahead,
  });
  expect(failedStatus(new TypeError("Failed to fetch"), 5, true).phase).toBe("offline");
  expect(failedStatus(new Error("boom"), 5, false).phase).toBe("offline");
  expect(failedStatus(new Error("sync failed: HTTP 401: unauthorized"), 5, true)).toEqual({
    phase: "error",
    lastSyncedAt: 5,
    message: "sync failed: HTTP 401: unauthorized",
  });
});
