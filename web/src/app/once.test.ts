import { expect, test } from "bun:test";
import { oncePerKey } from "./once.ts";

test("a second run of the same key waits for the first to land; other keys run at once", async () => {
  const once = oncePerKey();
  let release = () => {};
  const landed = new Promise<void>((r) => {
    release = r;
  });
  const writes: string[] = [];
  expect(once("sub-1", async () => (writes.push("sub-1"), await landed))).toBe(true);
  expect(once("sub-1", async () => writes.push("sub-1 again"))).toBe(false);
  expect(once("sub-2", async () => writes.push("sub-2"))).toBe(true);
  release();
  await landed;
  await Promise.resolve();
  expect(once("sub-1", async () => writes.push("sub-1 later"))).toBe(true);
  expect(writes).toEqual(["sub-1", "sub-2", "sub-1 later"]);
});
