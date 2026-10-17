import { mkdirSync } from "node:fs";
import { type Pulled, pullBackups } from "./pull-backups.ts";

export type RemotePull = { ok: true; results: Pulled[] } | { ok: false; error: string };

/** Lists the VPS backup folder over SSH and copies what the laptop lacks, verified. */
export function pullFromVps(ssh: string, remoteDir: string, dir: string): RemotePull {
  mkdirSync(dir, { recursive: true });
  const list = Bun.spawnSync(["ssh", ssh, "ls", "-1", remoteDir], {
    stdout: "pipe",
    stderr: "inherit",
  });
  if (!list.success) return { ok: false, error: `Could not list ${remoteDir} on ${ssh}` };
  const results = pullBackups({
    remote: list.stdout.toString().split("\n"),
    dir,
    copy: (name, to) =>
      Bun.spawnSync(["scp", "-q", `${ssh}:${remoteDir}/${name}`, to], { stderr: "inherit" })
        .success,
  });
  return { ok: true, results };
}

export function reportPulled(results: Pulled[], dir: string, ssh: string): void {
  if (results.length === 0) console.log(`Up to date: ${dir} already has every backup on ${ssh}`);
  for (const r of results) {
    console.log(
      r.ok ? `Pulled ${r.name}: integrity ok, ${r.docs} docs` : `FAILED ${r.name}: ${r.error}`,
    );
  }
}
