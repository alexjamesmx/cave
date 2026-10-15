import { expect, test } from "bun:test";
import { checkLocal, healthCheck, type Run, remote, runningCommit } from "./deploy.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLDER = "fedcba9876543210fedcba9876543210fedcba98";

/** A fake git: answers by the whole command, else by its first two words. */
function git(answers: Record<string, { ok: boolean; out?: string }>): Run {
  return (cmd) => {
    const answer = answers[cmd.join(" ")] ?? answers[cmd.slice(0, 2).join(" ")] ?? { ok: true };
    return { ok: answer.ok, out: answer.out ?? "" };
  };
}

const clean = {
  "git status": { ok: true, out: "" },
  "git rev-parse": { ok: true, out: `${SHA}\n` },
  "git merge-base": { ok: true },
};

test("a clean tree whose HEAD is on origin/main is deployed", () => {
  expect(checkLocal(git(clean))).toEqual({ ok: true, sha: SHA });
});

test("a dirty tree is refused", () => {
  const result = checkLocal(
    git({ ...clean, "git status": { ok: true, out: " M server/app.ts\n" } }),
  );
  expect(result).toEqual({ ok: false, error: "working tree is not clean; commit first" });
});

test("a HEAD other than the tip of origin/main is refused, older or unmerged", () => {
  const result = checkLocal(git({ ...clean, "git rev-parse HEAD": { ok: true, out: OLDER } }));
  expect(result).toMatchObject({ ok: false });
  expect(!result.ok && result.error).toContain("fedcba9 is not the tip of origin/main (0123456)");
});

test("a failed fetch stops the deploy", () => {
  expect(checkLocal(git({ ...clean, "git fetch": { ok: false } }))).toMatchObject({ ok: false });
});

test("deploy and rollback call the root wrapper on the VPS, with no secret on the line", () => {
  expect(remote.now("cave-vps")).toEqual(["ssh", "cave-vps", "/usr/local/sbin/cave-deploy", "now"]);
  expect(remote.rollback("cave-vps")).toEqual([
    "ssh",
    "cave-vps",
    "/usr/local/sbin/cave-deploy",
    "rollback",
  ]);
});

test("the running commit comes from the wrapper's last line", () => {
  expect(
    runningCommit(`== build ${SHA}
== restart
== running ${SHA}
`),
  ).toBe(SHA);
  expect(runningCommit("another deploy is still running")).toBeUndefined();
  expect(runningCommit("== running deadbeef")).toBeUndefined();
});

const answer = (status: number, body: unknown) =>
  (async () => Response.json(body, { status })) as unknown as typeof fetch;

test("the health check passes once the server reports the deployed commit", async () => {
  let calls = 0;
  const flaky = (async () => {
    calls++;
    return Response.json({ commit: calls < 3 ? "old" : SHA }, { status: 200 });
  }) as unknown as typeof fetch;
  const result = await healthCheck({
    url: "https://cave.example.dev",
    token: "t",
    sha: SHA,
    fetch: flaky,
    sleep: async () => {},
  });
  expect(result).toEqual({ ok: true });
  expect(calls).toBe(3);
});

test("the health check sends the token and fails with the last reason", async () => {
  let seen: string | null | undefined;
  const refusing = (async (_url: URL, init?: RequestInit) => {
    seen = new Headers(init?.headers).get("authorization");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }) as unknown as typeof fetch;
  const result = await healthCheck({
    url: "https://cave.example.dev",
    token: "secret",
    sha: SHA,
    fetch: refusing,
    attempts: 2,
    sleep: async () => {},
  });
  expect(seen).toBe("Bearer secret");
  expect(result).toEqual({ ok: false, error: "HTTP 401" });
  expect(
    await healthCheck({
      url: "https://x.dev",
      token: "t",
      sha: SHA,
      fetch: answer(200, { commit: null }),
      attempts: 1,
      sleep: async () => {},
    }),
  ).toEqual({ ok: false, error: "server reports commit null" });
});
