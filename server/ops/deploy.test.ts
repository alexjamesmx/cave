import { expect, test } from "bun:test";
import { checkLocal, healthCheck, type Run, remote, rolledBackTo } from "./deploy.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";

/** A fake git: answers by the first two words of each command. */
function git(answers: Record<string, { ok: boolean; out?: string }>): Run {
  return (cmd) => {
    const key = cmd.slice(0, 2).join(" ");
    const answer = answers[key] ?? { ok: true };
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

test("a commit that is not on origin/main is refused", () => {
  const result = checkLocal(git({ ...clean, "git merge-base": { ok: false } }));
  expect(result).toMatchObject({ ok: false });
  expect(!result.ok && result.error).toContain("not on origin/main");
});

test("a failed fetch stops the deploy", () => {
  expect(checkLocal(git({ ...clean, "git fetch": { ok: false } }))).toMatchObject({ ok: false });
});

test("build and rollback run as cave, which has no sudo rights; the restart runs as the admin login", () => {
  expect(remote.build("cave-vps", SHA)).toEqual([
    "ssh",
    "cave-vps",
    "sudo",
    "-u",
    "cave",
    "-H",
    "bash",
    "-s",
    "--",
    "build",
    SHA,
  ]);
  expect(remote.rollback("cave-vps").slice(-2)).toEqual(["--", "rollback"]);
  expect(remote.restart("cave-vps")).toEqual(["ssh", "cave-vps", "systemctl", "restart", "cave"]);
});

test("a rollback reports the commit it switched to", () => {
  expect(rolledBackTo(`== rolled back to ${SHA}\n`)).toBe(SHA);
  expect(rolledBackTo("no previous release to roll back to")).toBeUndefined();
  expect(rolledBackTo("== rolled back to deadbeef")).toBeUndefined();
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
