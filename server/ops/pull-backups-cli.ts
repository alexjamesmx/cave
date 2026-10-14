import { mkdirSync } from "node:fs";
import { pullBackups } from "./pull-backups.ts";

const ssh = process.env.CAVE_SSH || "cave-vps";
const remoteDir = process.env.CAVE_REMOTE_BACKUP_DIR || "/var/lib/cave/backups";
const dir = process.env.BACKUP_PULL_DIR;
if (!dir) {
  console.error("Set BACKUP_PULL_DIR (in the laptop's .env) to the folder that receives backups");
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

const list = Bun.spawnSync(["ssh", ssh, "ls", "-1", remoteDir], {
  stdout: "pipe",
  stderr: "inherit",
});
if (!list.success) {
  console.error(`Could not list ${remoteDir} on ${ssh}`);
  process.exit(1);
}

const results = pullBackups({
  remote: list.stdout.toString().split("\n"),
  dir,
  copy: (name, to) =>
    Bun.spawnSync(["scp", "-q", `${ssh}:${remoteDir}/${name}`, to], { stderr: "inherit" }).success,
});

if (results.length === 0) console.log(`Up to date: ${dir} already has every backup on ${ssh}`);
for (const r of results) {
  console.log(
    r.ok ? `Pulled ${r.name}: integrity ok, ${r.docs} docs` : `FAILED ${r.name}: ${r.error}`,
  );
}
if (results.some((r) => !r.ok)) process.exit(1);
