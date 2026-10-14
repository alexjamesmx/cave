export type Run = (cmd: string[]) => { ok: boolean; out: string };

export type Checked = { ok: true; sha: string } | { ok: false; error: string };

/**
 * The laptop side of a deploy: only a clean tree whose HEAD is already on `origin/main` is
 * shipped, so the VPS can fetch exactly the commit that was tested and reviewed.
 */
export function checkLocal(run: Run): Checked {
  const status = run(["git", "status", "--porcelain"]);
  if (!status.ok) return { ok: false, error: "git status failed" };
  if (status.out.trim()) return { ok: false, error: "working tree is not clean; commit first" };
  if (!run(["git", "fetch", "--quiet", "origin"]).ok) {
    return { ok: false, error: "git fetch origin failed" };
  }
  const head = run(["git", "rev-parse", "HEAD"]);
  if (!head.ok) return { ok: false, error: "git rev-parse HEAD failed" };
  const sha = head.out.trim();
  if (!run(["git", "merge-base", "--is-ancestor", sha, "origin/main"]).ok) {
    return { ok: false, error: `${sha.slice(0, 7)} is not on origin/main; push and merge first` };
  }
  return { ok: true, sha };
}

/**
 * Runs on the VPS as user `cave` in `/opt/cave`, with the commit as `$1`. Each step names
 * itself, and the first failure stops the script and names the step. The restart is the one
 * command the sudoers rule in `deploy/sudoers-cave` allows.
 */
export const REMOTE_SCRIPT = `set -euo pipefail
export PATH="/opt/bun/bin:$PATH"
step=""
trap 'echo "deploy failed at: $step" >&2' ERR
cd /opt/cave
step=fetch;    echo "== $step";    git fetch --quiet origin
step=verify;   echo "== $step";    git merge-base --is-ancestor "$1" origin/main
step=checkout; echo "== $step";    git checkout --quiet --detach "$1"
step=install;  echo "== $step";    bun install --frozen-lockfile
step=check;    echo "== $step";    bun run check
step=test;     echo "== $step";    bun test
step=restart;  echo "== $step";    sudo /usr/bin/systemctl restart cave
echo "== deployed $1"
`;

export interface HealthOptions {
  url: string;
  token: string;
  sha: string;
  fetch?: typeof fetch;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Waits for the restarted server to answer `/api/status` with the deployed commit. */
export async function healthCheck({
  url,
  token,
  sha,
  fetch: get = fetch,
  attempts = 10,
  sleep = (ms) => Bun.sleep(ms),
}: HealthOptions): Promise<{ ok: true } | { ok: false; error: string }> {
  let last = "no answer";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(2000);
    try {
      const res = await get(new URL("/api/status", url), {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.status !== 200) {
        last = `HTTP ${res.status}`;
        continue;
      }
      const { commit } = (await res.json()) as { commit?: unknown };
      if (commit === sha) return { ok: true };
      last = `server reports commit ${String(commit)}`;
    } catch (error) {
      last = (error as Error).message;
    }
  }
  return { ok: false, error: last };
}
