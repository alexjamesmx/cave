import { expect, test } from "bun:test";
import { join } from "node:path";

// The wrapper needs bash, flock, runuser and symlinks, as on the VPS.
test("deploy/cave-deploy: holds failed and unhealthy commits, rolls back, never leaks the token", () => {
  const result = Bun.spawnSync(["bash", join(import.meta.dir, "cave-deploy.test.sh")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = result.stdout.toString() + result.stderr.toString();
  if (!result.success) console.error(output);
  expect(result.success).toBe(true);
  expect(output).toContain("all passed");
}, 120_000);
