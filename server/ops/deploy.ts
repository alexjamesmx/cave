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

/** The script that builds, switches and rolls back releases on the VPS (`deploy/release.sh`). */
export const RELEASE_SCRIPT_PATH = new URL("../../deploy/release.sh", import.meta.url);

/**
 * Commands run over SSH. The release script goes over stdin and runs as `cave`, which has no
 * sudo rights; the restart runs as the admin login itself. Only a commit id appears on any
 * command line.
 */
const AS_CAVE = ["sudo", "-u", "cave", "-H", "bash", "-s", "--"];

export const remote = {
  build: (ssh: string, sha: string) => ["ssh", ssh, ...AS_CAVE, "build", sha],
  rollback: (ssh: string) => ["ssh", ssh, ...AS_CAVE, "rollback"],
  restart: (ssh: string) => ["ssh", ssh, "systemctl", "restart", "cave"],
};
/** The commit a rollback switched to, from the script's `== rolled back to <sha>` line. */
export function rolledBackTo(output: string): string | undefined {
  return /^== rolled back to ([0-9a-f]{40})$/m.exec(output)?.[1];
}

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
