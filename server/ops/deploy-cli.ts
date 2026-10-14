import { checkLocal, healthCheck, REMOTE_SCRIPT, type Run } from "./deploy.ts";

const ssh = process.env.CAVE_SSH || "cave-vps";
const url = process.env.CAVE_REMOTE_URL;
const token = process.env.CAVE_REMOTE_TOKEN;
if (!url || !token) {
  console.error("Set CAVE_REMOTE_URL and CAVE_REMOTE_TOKEN (in the laptop's .env) to deploy");
  process.exit(1);
}

const run: Run = (cmd) => {
  const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "inherit" });
  return { ok: result.success, out: result.stdout.toString() };
};

const local = checkLocal(run);
if (!local.ok) {
  console.error(`Not deployed: ${local.error}`);
  process.exit(1);
}
console.log(`Deploying ${local.sha.slice(0, 7)} to ${ssh}`);

// The script goes over stdin, so nothing but the commit id appears on any command line.
const remote = Bun.spawn(["ssh", ssh, "sudo", "-u", "cave", "-H", "bash", "-s", "--", local.sha], {
  stdin: new TextEncoder().encode(REMOTE_SCRIPT),
  stdout: "inherit",
  stderr: "inherit",
});
if ((await remote.exited) !== 0) {
  console.error("Not deployed: the step named above failed on the VPS");
  process.exit(1);
}

console.log("== health");
const health = await healthCheck({ url, token, sha: local.sha });
if (!health.ok) {
  console.error(`Deployed, but the health check failed: ${health.error}`);
  process.exit(1);
}
console.log(`Healthy: ${url} runs ${local.sha.slice(0, 7)}`);
