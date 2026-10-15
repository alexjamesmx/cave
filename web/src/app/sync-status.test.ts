import { expect, test } from "bun:test";
import { ClockAheadError, SyncRefusedError } from "../store/sync.ts";
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
  // A refused token is its own state: the owner fixes it in Settings, not by waiting.
  expect(failedStatus(new SyncRefusedError(401, "unauthorized"), 5, true)).toEqual({
    phase: "unauthorized",
    lastSyncedAt: 5,
  });
  expect(failedStatus(new SyncRefusedError(403, "origin not allowed"), 5, true)).toEqual({
    phase: "error",
    lastSyncedAt: 5,
    message: "sync failed: HTTP 403: origin not allowed",
  });
  expect(failedStatus(new Error("boom"), 5, true)).toEqual({
    phase: "error",
    lastSyncedAt: 5,
    message: "boom",
  });
});
