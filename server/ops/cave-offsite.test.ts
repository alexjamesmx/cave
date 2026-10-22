import { expect, test } from "bun:test";
import { join } from "node:path";

// Needs restic and bash: CI installs restic (.github/workflows/ci.yml); a laptop without it
// skips, and the harness also runs by hand.
const hasRestic = Bun.which("restic") !== null;

test.skipIf(!hasRestic)(
  "deploy/cave-offsite: backs up, checks a restored copy, fails on corruption, keeps secrets out",
  () => {
    const result = Bun.spawnSync(["bash", join(import.meta.dir, "cave-offsite.test.sh")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = result.stdout.toString() + result.stderr.toString();
    if (!result.success) console.error(output);
    expect(result.success).toBe(true);
    expect(output).toContain("all passed");
  },
  120_000,
);
