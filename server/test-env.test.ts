import { expect, test } from "bun:test";

test("bun test runs as CAVE_ENV=test (bunfig.toml preload)", () => {
  expect(process.env.CAVE_ENV).toBe("test");
});
