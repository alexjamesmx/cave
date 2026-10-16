import { gitIn } from "./git.ts";
import { finishWip, type Outcome, resumeWip, saveWip } from "./wip.ts";

const git = gitIn(process.cwd());
const [flag, message] = process.argv.slice(2);

const passes = (script: string[]) =>
  Bun.spawnSync(["bun", ...script], { stdio: ["inherit", "inherit", "inherit"] }).success;

let outcome: Outcome;
if (flag === undefined) outcome = saveWip(git, new Date());
else if (flag === "--resume") outcome = resumeWip(git);
else if (flag === "--finish")
  outcome = finishWip(
    { git, checks: () => passes(["run", "check"]) && passes(["test"]) },
    message ?? "",
  );
else
  outcome = { ok: false, error: 'usage: bun run wip [--resume | --finish "<one-line message>"]' };

if (outcome.ok) console.log(outcome.message);
else {
  console.error(`wip: ${outcome.error}`);
  process.exit(1);
}
