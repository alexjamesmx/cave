import { beforeEach, expect, test } from "bun:test";
import { type AgentRegistry, createAgentRegistry } from "./agents.ts";
import { openDb } from "./db.ts";

let agents: AgentRegistry;
beforeEach(() => {
  agents = createAgentRegistry(openDb(":memory:"));
});

test("a minted token authenticates its agent; only its hash is stored", () => {
  const added = agents.add("claude-code", ["read", "write"], null, 1);
  if (!added.ok) throw new Error(added.error);
  const { token, agent } = added.value;
  expect(token).toMatch(/^cave_[A-Za-z0-9_-]{43}$/);
  expect(agent).toEqual({
    name: "claude-code",
    scopes: ["read", "write"],
    collections: null,
    created: 1,
    revoked: null,
  });
  expect(agents.authenticate(token)?.name).toBe("claude-code");
  expect(agents.authenticate(`${token}x`)).toBeUndefined();
  expect(agents.authenticate("not-a-cave-token")).toBeUndefined();
});

test("tokens differ per agent and the allowlist is kept", () => {
  const a = agents.add("codex", ["read"], ["money", "tasks"], 1);
  const b = agents.add("opencode", ["read"], null, 1);
  if (!a.ok || !b.ok) throw new Error("add failed");
  expect(a.value.token).not.toBe(b.value.token);
  expect(agents.get("codex")?.collections).toEqual(["money", "tasks"]);
});

test("a revoked token stops working", () => {
  const added = agents.add("codex", ["read"], null, 1);
  if (!added.ok) throw new Error(added.error);
  expect(agents.revoke("codex", 2)).toBe(true);
  expect(agents.revoke("codex", 3)).toBe(false);
  expect(agents.authenticate(added.value.token)).toBeUndefined();
  expect(agents.get("codex")?.revoked).toBe(2);
});

test("names, scopes and collections are checked", () => {
  expect(agents.add("Claude Code", ["read"], null, 1)).toMatchObject({ ok: false });
  expect(agents.add("x".repeat(33), ["read"], null, 1)).toMatchObject({ ok: false });
  expect(agents.add("ok", ["admin"], null, 1)).toMatchObject({ ok: false });
  expect(agents.add("ok", [], null, 1)).toMatchObject({ ok: false });
  expect(agents.add("ok", ["read"], [], 1)).toMatchObject({ ok: false });
  expect(agents.add("ok", ["read"], ["Not An Id"], 1)).toMatchObject({ ok: false });
  agents.add("ok", ["read"], null, 1);
  expect(agents.add("ok", ["read"], null, 1)).toMatchObject({ ok: false });
});
