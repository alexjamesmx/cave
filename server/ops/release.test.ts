import { expect, test } from "bun:test";
import { join } from "node:path";

test("deploy/release.sh: failed builds never move current; rollback and pruning are safe", () => {
  const result = Bun.spawnSync(["bash", join(import.meta.dir, "release.test.sh")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = result.stdout.toString() + result.stderr.toString();
  if (!result.success) console.error(output);
  expect(result.success).toBe(true);
  expect(output).toContain("all passed");
}, 60_000);
