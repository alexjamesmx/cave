import { pullFromVps, reportPulled } from "./pull-remote.ts";

const ssh = process.env.CAVE_SSH || "cave-vps";
const remoteDir = process.env.CAVE_REMOTE_BACKUP_DIR || "/var/lib/cave/backups";
const dir = process.env.BACKUP_PULL_DIR;
if (!dir) {
  console.error("Set BACKUP_PULL_DIR (in the laptop's .env) to the folder that receives backups");
  process.exit(1);
}

const pulled = pullFromVps(ssh, remoteDir, dir);
if (!pulled.ok) {
  console.error(pulled.error);
  process.exit(1);
}
reportPulled(pulled.results, dir, ssh);
if (pulled.results.some((r) => !r.ok)) process.exit(1);
