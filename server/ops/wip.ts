import { currentBranch, type Git, isClean, remoteWips } from "./git.ts";

export type Outcome = { ok: true; message: string } | { ok: false; error: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** `wip/yyyy-mm-dd-hhmm` in local time, so the owner reads it as when they stopped. */
export function wipBranchName(at: Date): string {
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `wip/${day}-${pad(at.getHours())}${pad(at.getMinutes())}`;
}

/** Staged paths that must never reach a remote: env files, the data folder, databases. */
export function secretPaths(paths: string[]): string[] {
  return paths.filter((path) => {
    const name = path.split("/").at(-1) ?? "";
    const env = name.startsWith(".env") && name !== ".env.example";
    return env || path.startsWith("data/") || name.endsWith(".db");
  });
}

// What AGENTS.md ships as a PR: a schema migration, auth and the request guard, deploy/.
const PR_PATHS: [RegExp, string][] = [
  [/^deploy\//, "deploy/"],
  [/^server\/db\.ts$/, "a schema migration (server/db.ts)"],
  [/^server\/(auth|request-guard)\.ts$/, "auth or the request guard"],
];

const dependenciesOf = (packageJson: string | undefined): string => {
  try {
    const deps = (JSON.parse(packageJson ?? "{}") as { dependencies?: Record<string, string> })
      .dependencies;
    return JSON.stringify(Object.entries(deps ?? {}).sort());
  } catch {
    return "unreadable";
  }
};

/**
 * Why the work needs a PR rather than a push to main, from the changed paths and the runtime
 * dependencies before and after; empty when it may go straight to main.
 */
export function prReasons(
  changed: string[],
  packageBefore: string | undefined,
  packageAfter: string | undefined,
): string[] {
  const reasons = PR_PATHS.filter(([re]) => changed.some((path) => re.test(path))).map(
    ([, why]) => why,
  );
  if (
    changed.includes("package.json") &&
    dependenciesOf(packageBefore) !== dependenciesOf(packageAfter)
  )
    reasons.push("a runtime dependency change (package.json)");
  return reasons;
}

/** Saves every change on a `wip/*` branch and pushes it, so another device can carry on. */
export function saveWip(git: Git, now: Date): Outcome {
  if (isClean(git)) return { ok: true, message: "wip: nothing to save" };
  const start = currentBranch(git);
  let branch = start;
  let created = false;
  if (!branch?.startsWith("wip/")) {
    const base = wipBranchName(now);
    branch = base;
    for (let n = 2; git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).ok; n++)
      branch = `${base}-${n}`;
    if (!git("switch", "--quiet", "-c", branch).ok)
      return { ok: false, error: `could not create ${branch}` };
    created = true;
  }
  git("add", "-A");
  const secrets = secretPaths(git("diff", "--cached", "--name-only").out.split("\n"));
  if (secrets.length > 0) {
    git("reset", "--quiet");
    if (created && start) {
      git("switch", "--quiet", start);
      git("branch", "--quiet", "-D", branch);
    }
    return { ok: false, error: `not saved: ${secrets.join(", ")} must never be pushed` };
  }
  if (!git("commit", "--quiet", "--no-verify", "-m", "wip").ok)
    return { ok: false, error: "git commit failed" };
  const push = git("push", "--quiet", "-u", "origin", branch);
  if (!push.ok)
    return {
      ok: false,
      error: `committed on ${branch} but the push failed; run bun run wip again`,
    };
  return { ok: true, message: branch };
}

/** Switches to the newest `origin/wip/*`, up to date with it. */
export function resumeWip(git: Git): Outcome {
  if (!isClean(git))
    return { ok: false, error: "the working tree has changes; save or commit them first" };
  if (!git("fetch", "--prune", "--quiet").ok) return { ok: false, error: "git fetch failed" };
  const newest = remoteWips(git)[0];
  if (!newest) return { ok: false, error: "no origin/wip/* branch to resume" };
  const branch = newest.ref.replace(/^origin\//, "");
  if (git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).ok) {
    if (!git("switch", "--quiet", branch).ok)
      return { ok: false, error: `could not switch to ${branch}` };
    if (!git("merge", "--ff-only", "--quiet", newest.ref).ok)
      return { ok: false, error: `${branch} and ${newest.ref} diverged; merge them by hand` };
  } else if (!git("switch", "--quiet", "-c", branch, "--track", newest.ref).ok) {
    return { ok: false, error: `could not check out ${newest.ref}` };
  }
  return { ok: true, message: `on ${branch}` };
}

export interface FinishDeps {
  git: Git;
  /** `bun run check` and `bun test`; true when both pass. */
  checks: () => boolean;
}

/**
 * Lands a `wip/*` branch on main as one commit with the owner's message, pushes main and
 * deletes the branch here and on origin. Stops before anything changes when the work needs a
 * PR, a check fails or main can't take it cleanly.
 */
export function finishWip({ git, checks }: FinishDeps, message: string): Outcome {
  const msg = message.trim();
  if (!msg || msg.includes("\n"))
    return { ok: false, error: 'give a one-line message: bun run wip --finish "…"' };
  const branch = currentBranch(git);
  if (!branch?.startsWith("wip/")) return { ok: false, error: "not on a wip/* branch" };
  if (!isClean(git)) return { ok: false, error: "the working tree has changes; bun run wip first" };
  if (!git("fetch", "--prune", "--quiet").ok) return { ok: false, error: "git fetch failed" };

  const changed = git("diff", "--name-only", `origin/main...${branch}`)
    .out.split("\n")
    .filter(Boolean);
  const before = git("show", "origin/main:package.json");
  const after = git("show", `${branch}:package.json`);
  const reasons = prReasons(
    changed,
    before.ok ? before.out : undefined,
    after.ok ? after.out : undefined,
  );
  if (reasons.length > 0)
    return { ok: false, error: `this needs a PR, not a push to main: ${reasons.join("; ")}` };
  if (!checks()) return { ok: false, error: "bun run check or bun test failed; nothing changed" };

  if (!git("switch", "--quiet", "main").ok) return { ok: false, error: "could not switch to main" };
  if (!git("merge", "--ff-only", "--quiet", "origin/main").ok) {
    git("switch", "--quiet", branch);
    return {
      ok: false,
      error: "local main has commits origin doesn't; push or sort them out first",
    };
  }
  if (!git("merge", "--squash", "--quiet", branch).ok) {
    // main was clean a moment ago, so this only drops the half-done squash.
    git("reset", "--merge");
    git("switch", "--quiet", branch);
    return { ok: false, error: `${branch} conflicts with main; merge origin/main into it first` };
  }
  const commit = git("commit", "--quiet", "-m", msg);
  if (!commit.ok) {
    git("reset", "--merge");
    git("switch", "--quiet", branch);
    return { ok: false, error: `commit refused: ${commit.err || commit.out}` };
  }
  if (!git("push", "--quiet", "origin", "main").ok)
    return {
      ok: false,
      error: `committed on main but the push failed; push main, then delete ${branch}`,
    };
  git("branch", "--quiet", "-D", branch);
  git("push", "--quiet", "origin", "--delete", branch);
  return { ok: true, message: `main: ${msg}` };
}
