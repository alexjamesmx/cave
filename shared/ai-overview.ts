import { AI_SURFACES } from "./ai.ts";
import { describeFlow } from "./flows/describe.ts";
import { parseDefinition } from "./flows/registry.ts";
import { CAVE_TOOLS } from "./mcp-tools.ts";
import type { ActivityEntry } from "./runs.ts";
import type { Doc } from "./types.ts";

/**
 * AI → Overview (M8 part 5): the whole AI setup as one read-only map, built from what already
 * exists. Four columns, left to right: where AI is used, what connects it, the Cave's own
 * tools, and what runs on its own. Labels are titles only: no item body, no source path, and
 * any URL loses its query, so no token or keyed URL can appear.
 */

export type OverviewStatus = "active" | "disabled" | "failing";
export type OverviewColumn = "surfaces" | "connections" | "tools" | "automations";

// A type, not an interface, so React Flow can carry it as node data.
export type OverviewNode = {
  id: string;
  column: OverviewColumn;
  label: string;
  /** "MCP server", "agent token", "flow · every day at 08:00". */
  kind: string;
  status: OverviewStatus;
  lastActivity?: number;
  /** Where clicking it goes. */
  href: string;
};

export interface OverviewEdge {
  from: string;
  to: string;
}

export interface OverviewInput {
  ai: Doc[];
  /** Agent tokens, from `/api/agents`; missing offline. */
  agents: { name: string; revoked: number | null; lastCall: number | null }[];
  flows: Doc[];
  /** From `/api/system`; missing offline. */
  jobs: { id: string; label: string; lastRun?: number; lastResult?: string }[];
  telegram?: { ready: boolean } | undefined;
  activity: ActivityEntry[];
  now: number;
}

const URL_QUERY = /(https?:\/\/[^\s?#)]+)[?#][^\s)"']*/gi;
const LONG_SECRET = /\b[A-Za-z0-9_-]{32,}\b/g;

/** A label safe to show: a URL keeps only its address, and anything shaped like a key goes. */
export const safeLabel = (raw: unknown, fallback: string) => {
  const text = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
  return text.replace(URL_QUERY, "$1").replace(LONG_SECRET, "‹hidden›").slice(0, 80);
};

const SURFACE_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude-app": "Claude app",
  cowork: "Cowork",
  codex: "Codex",
};

const live = (d: Doc) => d.data._deleted !== true;
const statusOf = (d: Doc): OverviewStatus => (d.data.status === "disabled" ? "disabled" : "active");
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildOverview(input: OverviewInput): {
  nodes: OverviewNode[];
  edges: OverviewEdge[];
  counts: { label: string; value: number }[];
} {
  const ai = input.ai.filter(live);
  const nodes: OverviewNode[] = [];
  const edges: OverviewEdge[] = [];
  const ofKind = (kind: string) => ai.filter((d) => d.data.kind === kind);

  // Surfaces: the AI apps in use, plus the Cave's own Ask and Telegram.
  for (const surface of AI_SURFACES.filter((s) => s !== "any")) {
    const items = ai.filter((d) => d.data.surface === surface);
    if (items.length === 0) continue;
    nodes.push({
      id: `surface:${surface}`,
      column: "surfaces",
      label: SURFACE_LABEL[surface] ?? surface,
      kind: `${items.length} rules, skills and tools`,
      status: items.some((d) => statusOf(d) === "active") ? "active" : "disabled",
      href: `/ai/setup?surface=${surface}`,
    });
  }
  nodes.push({
    id: "surface:ask",
    column: "surfaces",
    label: "Cave Ask",
    kind: "Home's Ask box",
    status: "active",
    href: "/",
  });
  if (input.telegram)
    nodes.push({
      id: "surface:telegram",
      column: "surfaces",
      label: "Telegram",
      kind: "notifications and commands",
      status: input.telegram.ready ? "active" : "disabled",
      href: "/settings/notifications",
    });

  // Connections: MCP servers and connectors the apps use, and the Cave's agent tokens.
  for (const d of [...ofKind("mcp-server"), ...ofKind("connector")]) {
    nodes.push({
      id: `ai:${d.id}`,
      column: "connections",
      label: safeLabel(d.data._title, "MCP server"),
      kind: d.data.kind === "connector" ? "connector" : "MCP server",
      status: statusOf(d),
      href: `/ai/setup?kind=${String(d.data.kind)}`,
    });
    const surface = typeof d.data.surface === "string" ? `surface:${d.data.surface}` : undefined;
    if (surface && nodes.some((n) => n.id === surface))
      edges.push({ from: surface, to: `ai:${d.id}` });
  }
  for (const a of input.agents) {
    nodes.push({
      id: `agent:${a.name}`,
      column: "connections",
      label: a.name,
      kind: "agent token",
      status: a.revoked ? "disabled" : "active",
      ...(a.lastCall ? { lastActivity: a.lastCall } : {}),
      href: "/ai/agents",
    });
    if (!a.revoked) edges.push({ from: `agent:${a.name}`, to: "tools:cave" });
  }

  // The Cave's tools, as one node: the MCP server every agent token reaches.
  const read = CAVE_TOOLS.filter((t) => t.scope === "read").length;
  nodes.push({
    id: "tools:cave",
    column: "tools",
    label: "Cave MCP",
    kind: `${CAVE_TOOLS.length} tools · ${read} read, ${CAVE_TOOLS.length - read} write`,
    status: "active",
    href: "/ai/agents",
  });

  // Automations: flows with their trigger, and the server's jobs.
  const runs = input.activity;
  for (const f of input.flows.filter(live)) {
    const parsed = parseDefinition(f.data.definition);
    const last = runs.find((r) => r.source === "flow" && r.title === f.data._title);
    nodes.push({
      id: `flow:${f.id}`,
      column: "automations",
      label: safeLabel(f.data._title, "Flow"),
      kind: `flow · ${parsed.ok ? (describeFlow(parsed.value)[0] ?? "") : "not valid"}`,
      status:
        last?.status === "failed" ? "failing" : f.data.status === "on" ? "active" : "disabled",
      ...(last ? { lastActivity: last.startedAt } : {}),
      href: `/ai/flows/${encodeURIComponent(f.id)}`,
    });
    edges.push({ from: "tools:cave", to: `flow:${f.id}` });
  }
  for (const j of input.jobs) {
    nodes.push({
      id: `job:${j.id}`,
      column: "automations",
      label: j.label,
      kind: "job",
      status: j.lastResult === "error" ? "failing" : "active",
      ...(j.lastRun ? { lastActivity: j.lastRun } : {}),
      href: "/ai/activity?source=job",
    });
  }

  const today = input.now - DAY_MS;
  const week = input.now - 7 * DAY_MS;
  return {
    nodes,
    edges,
    counts: [
      { label: "rules", value: ofKind("rule").length },
      { label: "skills", value: ofKind("skill").length },
      { label: "plugins", value: ofKind("plugin").length },
      { label: "MCP servers", value: ofKind("mcp-server").length },
      { label: "agents", value: input.agents.filter((a) => !a.revoked).length },
      {
        label: "flows on",
        value: input.flows.filter((f) => live(f) && f.data.status === "on").length,
      },
      { label: "runs today", value: runs.filter((r) => r.startedAt >= today).length },
      {
        label: "failures, 7 days",
        value: runs.filter((r) => r.status === "failed" && r.startedAt >= week).length,
      },
    ],
  };
}
