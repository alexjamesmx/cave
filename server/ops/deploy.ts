export type Run = (cmd: string[]) => { ok: boolean; out: string };

export type Checked = { ok: true; sha: string } | { ok: false; error: string };

/**
 * The laptop side of a deploy: the VPS deploys the tip of `origin/main`, so only a clean tree
 * whose HEAD is that tip is accepted; anything else would ship a commit other than the one the
 * owner is looking at.
 */
export function checkLocal(run: Run): Checked {
  const status = run(["git", "status", "--porcelain"]);
  if (!status.ok) return { ok: false, error: "git status failed" };
  if (status.out.trim()) return { ok: false, error: "working tree is not clean; commit first" };
  if (!run(["git", "fetch", "--quiet", "origin"]).ok) {
    return { ok: false, error: "git fetch origin failed" };
  }
  const head = run(["git", "rev-parse", "HEAD"]);
  const tip = run(["git", "rev-parse", "origin/main"]);
  if (!head.ok || !tip.ok) return { ok: false, error: "git rev-parse failed" };
  const sha = head.out.trim();
  const main = tip.out.trim();
  if (sha !== main) {
    return {
      ok: false,
      error: `HEAD ${sha.slice(0, 7)} is not the tip of origin/main (${main.slice(0, 7)}); the VPS deploys the tip: check out main and pull, or push and merge first`,
    };
  }
  return { ok: true, sha };
}

/** Installed by hand on the VPS from `deploy/cave-deploy`; the only thing that deploys. */
export const WRAPPER = "/usr/local/sbin/cave-deploy";

/** Commands run over SSH as root. No token or other secret appears on either line. */
export const remote = {
  now: (ssh: string) => ["ssh", ssh, WRAPPER, "now"],
  rollback: (ssh: string) => ["ssh", ssh, WRAPPER, "rollback"],
};

/** The commit the VPS runs after the wrapper finished, from its `== running <sha>` line. */
export function runningCommit(output: string): string | undefined {
  return /^== running ([0-9a-f]{40})$/m.exec(output)?.[1];
}

export interface HealthOptions {
  url: string;
  token: string;
  sha: string;
  fetch?: typeof fetch;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Asks the public URL for `/api/status` until it reports the commit. The VPS already checked
 * loopback; this proves the path through Caddy.
 */
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
