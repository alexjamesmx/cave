import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The CLI moved to server/cli, so the server it spawns is two directories up, not one. */
test("dev:seed starts the server from the repository root", () => {
  const source = readFileSync(join(import.meta.dir, "dev-seed.ts"), "utf8");
  const cwd = /cwd: `\$\{import\.meta\.dir\}(\/[^`]*)`/.exec(source)?.[1];
  expect(cwd).toBeDefined();
  expect(existsSync(join(import.meta.dir, cwd ?? "", "server", "main.ts"))).toBe(true);
});
