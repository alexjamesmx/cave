interface GitResult {
  ok: boolean;
  out: string;
  err: string;
}

export type Git = (...args: string[]) => GitResult;

/** Runs git in `cwd`; tests pass a temp repo and an env that ignores the machine's config. */
export function gitIn(cwd: string, env: Record<string, string | undefined> = process.env): Git {
  return (...args) => {
    const result = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    return {
      ok: result.success,
      out: result.stdout.toString().trim(),
      err: result.stderr.toString().trim(),
    };
  };
}

export const currentBranch = (git: Git) => {
  const head = git("rev-parse", "--abbrev-ref", "HEAD");
  return head.ok && head.out !== "HEAD" ? head.out : undefined;
};

export const isClean = (git: Git) => {
  const status = git("status", "--porcelain");
  return status.ok && status.out === "";
};

interface WipRef {
  /** `origin/wip/…` */
  ref: string;
  /** ISO time of its last commit. */
  at: string;
}

/** `origin/wip/*`, newest first, as the last fetch left them. */
export function remoteWips(git: Git): WipRef[] {
  const refs = git(
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short) %(committerdate:iso-strict)",
    "refs/remotes/origin/wip/",
  );
  if (!refs.ok || !refs.out) return [];
  return refs.out.split("\n").map((line) => {
    const [ref = "", at = ""] = line.split(" ");
    return { ref, at };
  });
}
