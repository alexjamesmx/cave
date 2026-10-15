import { checkLocal, healthCheck, type Run, remote, runningCommit } from "./deploy.ts";

const ssh = process.env.CAVE_SSH || "cave-vps";
const url = process.env.CAVE_REMOTE_URL;
const token = process.env.CAVE_REMOTE_TOKEN;
if (!url || !token) {
  console.error("Set CAVE_REMOTE_URL and CAVE_REMOTE_TOKEN (in the laptop's .env) to deploy");
  process.exit(1);
}
const rollback = process.argv.includes("--rollback");

const run: Run = (cmd) => {
  const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "inherit" });
  return { ok: result.success, out: result.stdout.toString() };
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Runs the wrapper on the VPS, streaming its output as it comes. */
async function onVps(cmd: string[]): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(cmd, { stdin: "ignore", stdout: "pipe", stderr: "inherit" });
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of proc.stdout) {
    const text = decoder.decode(chunk, { stream: true });
    process.stdout.write(text);
    out += text;
  }
  return { ok: (await proc.exited) === 0, out };
}

let result: { ok: boolean; out: string };
if (rollback) {
  console.log(`Rolling back on ${ssh}`);
  result = await onVps(remote.rollback(ssh));
} else {
  const local = checkLocal(run);
  if (!local.ok) fail(`Not deployed: ${local.error}`);
  console.log(`Deploying ${local.sha.slice(0, 7)} on ${ssh}`);
  result = await onVps(remote.now(ssh));
}
const sha = runningCommit(result.out);
if (!result.ok) {
  fail(`The VPS reported a failure above${sha ? `; it runs ${sha.slice(0, 7)}` : ""}`);
}
if (!sha) fail("The VPS did not say which commit it runs");

console.log("== public health");
const health = await healthCheck({ url, token, sha });
if (!health.ok) fail(`The public health check failed: ${health.error}`);
console.log(`Healthy: ${url} runs ${sha.slice(0, 7)}`);
