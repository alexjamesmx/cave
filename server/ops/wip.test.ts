import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Git, gitIn } from "./git.ts";
import { syncRepo } from "./sync.ts";
import { finishWip, prReasons, resumeWip, saveWip, secretPaths, wipBranchName } from "./wip.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// The machine's git config (hooks, signing, user) must not leak into the temp repos.
const env = (home: string) => ({
  PATH: process.env.PATH,
  HOME: home,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: join(home, "gitconfig"),
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.test",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.test",
});

interface Repos {
  root: string;
  remote: string;
  a: Git;
  b: Git;
  aDir: string;
  bDir: string;
}

/** A bare remote with main, and two devices that cloned it. */
function repos(): Repos {
  const root = mkdtempSync(join(tmpdir(), "cave-wip-"));
  dirs.push(root);
  const e = env(root);
  const remote = join(root, "remote.git");
  const sh = gitIn(root, e);
  sh("init", "--quiet", "--bare", "-b", "main", remote);
  const aDir = join(root, "a");
  const bDir = join(root, "b");
  sh("clone", "--quiet", remote, aDir);
  const a = gitIn(aDir, e);
  a("switch", "--quiet", "-c", "main");
  writeFileSync(join(aDir, "README.md"), "cave\n");
  writeFileSync(join(aDir, "package.json"), JSON.stringify({ dependencies: { zod: "4" } }));
  a("add", "-A");
  a("commit", "--quiet", "-m", "start");
  a("push", "--quiet", "-u", "origin", "main");
  sh("clone", "--quiet", remote, bDir);
  return { root, remote, a, b: gitIn(bDir, e), aDir, bDir };
}

const commitFile = (git: Git, dir: string, file: string, text: string) => {
  writeFileSync(join(dir, file), text);
  git("add", "-A");
  git("commit", "--quiet", "-m", `edit ${file}`);
};

describe("wipBranchName", () => {
  test("is wip/ and the local date and time to the minute", () => {
    expect(wipBranchName(new Date(2026, 9, 6, 7, 5))).toBe("wip/2026-10-06-0705");
  });
});

describe("secretPaths", () => {
  test("env files, data/ and databases are caught; .env.example and look-alikes are not", () => {
    expect(
      secretPaths([
        ".env",
        ".env.production",
        "web/.env.local",
        ".env.example",
        "data/cave.db",
        "data/notes.txt",
        "backups/x.db",
        "docs/environment.md",
        "server/db.ts",
      ]),
    ).toEqual([
      ".env",
      ".env.production",
      "web/.env.local",
      "data/cave.db",
      "data/notes.txt",
      "backups/x.db",
    ]);
  });
});

describe("prReasons", () => {
  const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
    JSON.stringify({ dependencies: deps, devDependencies: dev });

  test("deploy/, the schema, auth and the request guard need a PR", () => {
    expect(prReasons(["deploy/release.sh"], undefined, undefined)).toEqual(["deploy/"]);
    expect(prReasons(["server/db.ts"], undefined, undefined)[0]).toContain("schema migration");
    expect(
      prReasons(["server/auth.ts", "server/request-guard.ts"], undefined, undefined),
    ).toHaveLength(1);
  });

  test("a runtime dependency change needs a PR; a dev dependency or other edit does not", () => {
    expect(prReasons(["package.json"], pkg({ zod: "4" }), pkg({ zod: "4", left: "1" }))).toEqual([
      "a runtime dependency change (package.json)",
    ]);
    expect(prReasons(["package.json"], pkg({ zod: "4" }), pkg({ zod: "4" }, { x: "1" }))).toEqual(
      [],
    );
    expect(prReasons(["web/src/App.tsx", "server/dbx.ts"], undefined, undefined)).toEqual([]);
  });
});

describe("syncRepo", () => {
  test("up to date says so in one line", () => {
    const r = repos();
    expect(syncRepo(r.b)).toEqual(["sync: main is up to date with origin/main"]);
  });

  test("a branch that only lags is fast-forwarded", () => {
    const r = repos();
    commitFile(r.a, r.aDir, "a.txt", "1");
    r.a("push", "--quiet");
    expect(syncRepo(r.b)).toEqual(["sync: main fast-forwarded 1 commit(s) from origin/main"]);
    expect(r.b("rev-parse", "HEAD").out).toBe(r.a("rev-parse", "HEAD").out);
  });

  test("a diverged branch is left alone", () => {
    const r = repos();
    commitFile(r.a, r.aDir, "a.txt", "1");
    r.a("push", "--quiet");
    commitFile(r.b, r.bDir, "b.txt", "2");
    const head = r.b("rev-parse", "HEAD").out;
    expect(syncRepo(r.b)[0]).toContain("diverged (1 ahead, 1 behind); nothing changed");
    expect(r.b("rev-parse", "HEAD").out).toBe(head);
  });

  test("other devices' wip branches are listed, this one's is not", () => {
    const r = repos();
    writeFileSync(join(r.aDir, "half.txt"), "half");
    const saved = saveWip(r.a, new Date(2026, 9, 16, 9, 30));
    expect(saved).toEqual({ ok: true, message: "wip/2026-10-16-0930" });
    expect(syncRepo(r.b)[1]).toMatch(
      /^sync: unfinished work: origin\/wip\/2026-10-16-0930 \(.+\); bun run wip --resume$/,
    );
    r.a("fetch", "--quiet");
    expect(syncRepo(r.a)).toHaveLength(1);
  });

  test("offline: one line, nothing else", () => {
    const r = repos();
    renameSync(r.remote, `${r.remote}.gone`);
    expect(syncRepo(r.b)).toEqual(["sync: fetch failed (offline?); working from the local copy"]);
  });
});

describe("wip", () => {
  test("a clean tree saves nothing", () => {
    const r = repos();
    expect(saveWip(r.a, new Date())).toEqual({ ok: true, message: "wip: nothing to save" });
  });

  test("a secret file aborts before any commit and puts the tree back", () => {
    const r = repos();
    writeFileSync(join(r.aDir, ".env"), "CAVE_TOKEN=x");
    writeFileSync(join(r.aDir, "ok.txt"), "fine");
    const saved = saveWip(r.a, new Date(2026, 9, 16, 9, 30));
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.error).toContain(".env must never be pushed");
    expect(r.a("rev-parse", "--abbrev-ref", "HEAD").out).toBe("main");
    expect(r.a("branch", "--list", "wip/*").out).toBe("");
    expect(r.a("diff", "--cached", "--name-only").out).toBe("");
    expect(r.a("ls-remote", "--heads", "origin").out).not.toContain("wip/");
  });

  test("save on one device, resume and finish on the other: one commit on main", () => {
    const r = repos();
    writeFileSync(join(r.aDir, "feature.txt"), "half done");
    const saved = saveWip(r.a, new Date(2026, 9, 16, 9, 30));
    if (!saved.ok) throw new Error(saved.error);

    expect(resumeWip(r.b)).toEqual({ ok: true, message: `on ${saved.message}` });
    commitFile(r.b, r.bDir, "feature.txt", "done");
    expect(saveWip(r.b, new Date()).ok).toBe(true);

    const before = r.b("rev-list", "--count", "origin/main").out;
    const done = finishWip({ git: r.b, checks: () => true }, "Feature, finished");
    expect(done).toEqual({ ok: true, message: "main: Feature, finished" });
    r.b("fetch", "--prune", "--quiet");
    expect(Number(r.b("rev-list", "--count", "origin/main").out)).toBe(Number(before) + 1);
    expect(r.b("log", "-1", "--format=%s", "origin/main").out).toBe("Feature, finished");
    expect(r.b("show", "origin/main:feature.txt").out).toBe("done");
    expect(r.b("branch", "--list", "wip/*").out).toBe("");
    expect(r.b("ls-remote", "--heads", "origin").out).not.toContain("wip/");
  });

  test("finish stops before main changes when the work needs a PR or a check fails", () => {
    const r = repos();
    commitFile(
      r.a,
      r.aDir,
      "package.json",
      JSON.stringify({ dependencies: { zod: "4", left: "1" } }),
    );
    r.a("switch", "--quiet", "-c", "wip/2026-10-16-1000");
    writeFileSync(join(r.aDir, "x.txt"), "x");
    r.a("add", "-A");
    r.a("commit", "--quiet", "-m", "wip");
    const pr = finishWip({ git: r.a, checks: () => true }, "Add left");
    expect(pr.ok).toBe(false);
    if (!pr.ok) expect(pr.error).toContain("needs a PR");

    const r2 = repos();
    writeFileSync(join(r2.aDir, "y.txt"), "y");
    const saved = saveWip(r2.a, new Date());
    if (!saved.ok) throw new Error(saved.error);
    const failed = finishWip({ git: r2.a, checks: () => false }, "Y");
    expect(failed.ok).toBe(false);
    expect(r2.a("rev-parse", "--abbrev-ref", "HEAD").out).toBe(saved.message);
    expect(r2.a("log", "-1", "--format=%s", "origin/main").out).toBe("start");
  });

  test("finish refuses a message of more than one line, and a branch that isn't wip/*", () => {
    const r = repos();
    expect(finishWip({ git: r.a, checks: () => true }, "One").ok).toBe(false);
    r.a("switch", "--quiet", "-c", "wip/x");
    expect(finishWip({ git: r.a, checks: () => true }, "One\nTwo").ok).toBe(false);
  });

  test("a conflict with main leaves main as it was and returns to the wip branch", () => {
    const r = repos();
    writeFileSync(join(r.aDir, "README.md"), "mine\n");
    const saved = saveWip(r.a, new Date());
    if (!saved.ok) throw new Error(saved.error);
    commitFile(r.b, r.bDir, "README.md", "theirs\n");
    r.b("push", "--quiet");
    const result = finishWip({ git: r.a, checks: () => true }, "Mine");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("conflicts with main");
    expect(r.a("rev-parse", "--abbrev-ref", "HEAD").out).toBe(saved.message);
    expect(r.a("status", "--porcelain").out).toBe("");
    expect(r.a("log", "-1", "--format=%s", "main").out).toBe("edit README.md");
  });
});
