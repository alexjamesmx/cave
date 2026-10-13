import { expect, test } from "bun:test";
import { isDeviceId, isDocId, newId } from "./ids.ts";

test("newId is a 26-char Crockford ULID that sorts by time", () => {
  const a = newId(1_000);
  const b = newId(2_000);
  expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(a < b).toBe(true);
  expect(newId(1_000)).not.toBe(a);
});

test("isDocId accepts ULIDs, import ids and slugs", () => {
  for (const id of [newId(), `imp-${"a".repeat(40)}`, "money", "water_2l", "settings-ui"]) {
    expect(isDocId(id)).toBe(true);
  }
});

test("isDocId rejects anything else", () => {
  for (const id of ["", "Money", "has space", "../x", "imp-xyz", "x".repeat(65), 7, null]) {
    expect(isDocId(id)).toBe(false);
  }
});

test("isDeviceId rejects separators that would break stamp parsing", () => {
  expect(isDeviceId("phone-01")).toBe(true);
  for (const id of ["", "a:b", "a b", "x".repeat(65), 1]) expect(isDeviceId(id)).toBe(false);
});
