import {
  checkLocal,
  healthCheck,
  RELEASE_SCRIPT_PATH,
  type Run,
  remote,
  rolledBackTo,
} from "./deploy.ts";

const ssh = process.env.CAVE_SSH || "cave-vps";
const url = process.env.CAVE_REMOTE_URL;
const token = process.env.CAVE_REMOTE_TOKEN;
if (!url || !token) {
  console.error("Set CAVE_REMOTE_URL and CAVE_REMOTE_TOKEN (in the laptop's .env) to deploy");
  process.exit(1);
}
const rollback = process.argv.includes("--rollback");
const script = await Bun.file(RELEASE_SCRIPT_PATH).bytes();

const run: Run = (cmd) => {
  const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "inherit" });
  return { ok: result.success, out: result.stdout.toString() };
};

/** Runs the release script on the VPS, echoing its output; null when it failed. */
async function release(cmd: string[]): Promise<string | null> {
  const proc = Bun.spawn(cmd, { stdin: script, stdout: "pipe", stderr: "inherit" });
  const out = await new Response(proc.stdout).text();
  process.stdout.write(out);
  return (await proc.exited) === 0 ? out : null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let sha: string;
if (rollback) {
  console.log(`Rolling back on ${ssh}`);
  const out = await release(remote.rollback(ssh));
  const target = out === null ? undefined : rolledBackTo(out);
  if (!target) fail("Not rolled back: see the message above");
  sha = target;
} else {
  const local = checkLocal(run);
  if (!local.ok) fail(`Not deployed: ${local.error}`);
  sha = local.sha;
  console.log(`Deploying ${sha.slice(0, 7)} to ${ssh}`);
  // Built and tested in its own release directory; `current` moves only when that passed.
  if ((await release(remote.build(ssh, sha))) === null) {
    fail("Not deployed: the step named above failed on the VPS; the running release is unchanged");
  }
}

console.log("== restart");
if (!run(remote.restart(ssh)).ok) fail("The release is switched, but the restart failed");

console.log("== health");
const health = await healthCheck({ url, token, sha });
if (!health.ok) {
  fail(
    `The health check failed: ${health.error}. bun run deploy --rollback returns to the previous release`,
  );
}
console.log(`Healthy: ${url} runs ${sha.slice(0, 7)}`);
