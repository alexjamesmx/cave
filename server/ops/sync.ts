import { currentBranch, type Git, remoteWips } from "./git.ts";

const MAX_WIPS = 5;

const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

/**
 * What a session should know at start: the current branch brought up to date when it only
 * lags its upstream, and the unfinished work other devices pushed. Never changes a branch that
 * diverged, and git itself refuses a fast-forward that would overwrite local changes. A few
 * lines at most: they land in Claude's context.
 */
export function syncRepo(git: Git): string[] {
  if (!git("fetch", "--prune", "--quiet").ok)
    return ["sync: fetch failed (offline?); working from the local copy"];
  const lines: string[] = [];
  const branch = currentBranch(git);
  const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
  if (branch && upstream.ok) {
    const counts = git("rev-list", "--left-right", "--count", "HEAD...@{u}");
    const [ahead = 0, behind = 0] = counts.out.split(/\s+/).map(Number);
    if (behind > 0 && ahead === 0) {
      lines.push(
        git("merge", "--ff-only", "--quiet", "@{u}").ok
          ? `sync: ${branch} fast-forwarded ${behind} commit(s) from ${upstream.out}`
          : `sync: ${branch} is ${behind} behind ${upstream.out}; git refused to fast-forward over local changes`,
      );
    } else if (behind > 0) {
      lines.push(
        `sync: ${branch} and ${upstream.out} diverged (${ahead} ahead, ${behind} behind); nothing changed`,
      );
    } else if (ahead > 0) {
      lines.push(`sync: ${branch} is ${ahead} ahead of ${upstream.out}, not pushed`);
    } else {
      lines.push(`sync: ${branch} is up to date with ${upstream.out}`);
    }
  }
  const own = branch ? `origin/${branch}` : undefined;
  const wips = remoteWips(git).filter((w) => w.ref !== own);
  if (wips.length > 0) {
    const shown = wips.slice(0, MAX_WIPS).map((w) => `${w.ref} (${when(w.at)})`);
    const more = wips.length > MAX_WIPS ? `, and ${wips.length - MAX_WIPS} more` : "";
    lines.push(`sync: unfinished work: ${shown.join(", ")}${more}; bun run wip --resume`);
  }
  return lines;
}
