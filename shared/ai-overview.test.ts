import { expect, test } from "bun:test";
import { buildOverview, safeLabel } from "./ai-overview.ts";
import { SEEDED_FLOWS } from "./flows/drafts.ts";
import { CAVE_TOOLS } from "./mcp-tools.ts";
import type { Doc } from "./types.ts";

const ai = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection: "ai",
  data,
  stamps: {},
  actor: "user:ai-sync",
});

// Built at run time, so no scanner takes the test for a leaked key.
const TOKEN = ["sk", "ant", "0123456789abcdefghijklmnopqrstuv"].join("-");

const input = () => ({
  ai: [
    ai("a1", {
      _title: `exa (https://mcp.exa.ai/mcp?exaApiKey=${TOKEN})`,
      kind: "mcp-server",
      surface: "claude-code",
      status: "active",
      source: "repo:.mcp.json#exa",
      _body: `{"headers":{"authorization":"Bearer ${TOKEN}"}}`,
    }),
    ai("a2", { _title: "Global rules", kind: "rule", surface: "claude-code", status: "active" }),
    ai("a3", { _title: "superpowers", kind: "plugin", surface: "claude-code", status: "disabled" }),
    ai("a4", { _title: "Gmail", kind: "connector", surface: "claude-app", status: "active" }),
  ],
  agents: [
    { name: "claude", revoked: null, lastCall: 5 },
    { name: "old", revoked: 3, lastCall: null },
  ],
  flows: SEEDED_FLOWS.map((f) => ({
    ...f,
    kind: "item" as const,
    collection: "flows",
    stamps: {},
    actor: "seed",
  })),
  jobs: [
    { id: "backups", label: "Backups", lastRun: 9, lastResult: "ok" },
    { id: "reminders", label: "Reminder notifications", lastResult: "error" },
  ],
  telegram: { ready: false },
  activity: [
    {
      id: "r1",
      source: "agent" as const,
      title: "x",
      by: "claude",
      status: "failed" as const,
      startedAt: 99,
      steps: [],
    },
  ],
  now: 100,
});

test("four columns: surfaces, connections, the Cave's tools, automations; edges between them", () => {
  const { nodes, edges } = buildOverview(input());
  const col = (c: string) => nodes.filter((n) => n.column === c).map((n) => n.label);
  expect(col("surfaces")).toEqual(["Claude Code", "Claude app", "Cave Ask", "Telegram"]);
  expect(col("connections")).toEqual(["exa (https://mcp.exa.ai/mcp)", "Gmail", "claude", "old"]);
  expect(col("tools")).toEqual(["Cave MCP"]);
  expect(nodes.find((n) => n.id === "tools:cave")?.kind).toContain(`${CAVE_TOOLS.length} tools`);
  expect(col("automations")).toEqual([
    ...SEEDED_FLOWS.map((f) => f.data._title),
    "Backups",
    "Reminder notifications",
  ]);
  expect(nodes.find((n) => n.id === "job:reminders")?.status).toBe("failing");
  expect(nodes.find((n) => n.id === "agent:old")?.status).toBe("disabled");
  expect(nodes.find((n) => n.id === "surface:telegram")?.status).toBe("disabled");
  expect(edges).toContainEqual({ from: "surface:claude-code", to: "ai:a1" });
  expect(edges).toContainEqual({ from: "agent:claude", to: "tools:cave" });
  expect(edges).not.toContainEqual({ from: "agent:old", to: "tools:cave" });
});

test("counts of the setup", () => {
  const { counts } = buildOverview(input());
  expect(Object.fromEntries(counts.map((c) => [c.label, c.value]))).toMatchObject({
    rules: 1,
    plugins: 1,
    "MCP servers": 1,
    agents: 1,
    "runs today": 1,
    "failures, 7 days": 1,
  });
});

test("no secret reaches the overview: no token, no keyed URL, no body or source path", () => {
  const all = JSON.stringify(buildOverview(input()));
  expect(all).not.toContain(TOKEN);
  expect(all).not.toContain("exaApiKey");
  expect(all).not.toContain("authorization");
  expect(all).not.toContain(".mcp.json");
  expect(safeLabel(`token ${"a".repeat(40)}`, "x")).toBe("token ‹hidden›");
});
