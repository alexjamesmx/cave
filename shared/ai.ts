import type { CollectionData, Field } from "./schema.ts";

export const AI = "ai";
export const AI_KINDS = [
  "mcp-server",
  "connector",
  "skill",
  "plugin",
  "rule",
  "memory",
  "agent",
  "provider",
  "prompt",
] as const;
export const AI_SURFACES = ["claude-code", "claude-app", "cowork", "codex", "any"] as const;
export const AI_SCOPES = ["repo", "user", "account"] as const;

const select = (id: string, name: string, values: readonly string[], color: string): Field => ({
  id,
  name,
  type: "select",
  options: values.map((value) => ({ value, icon: "circle", color })),
});

/**
 * Everything the AIs know and use (M7b part 8): rules, skills, MCP servers, plugins, memory,
 * agents. `_body` holds the content with secrets removed; `source` says where it came from
 * (`repo:AGENTS.md`, `~/.claude/CLAUDE.md`, `manual`), so `ai-sync --apply` can write an edit
 * back. `_syncHash` is the hash of the body `ai-sync` last pushed: a different body means the
 * item was edited in the Cave.
 */
export const AI_COLLECTION: CollectionData = {
  name: "AI",
  icon: "sparkles",
  color: "#C77DFF",
  order: 9,
  fields: [
    select("kind", "Kind", AI_KINDS, "#C77DFF"),
    select("surface", "Surface", AI_SURFACES, "#3DE0FF"),
    select("scope", "Scope", AI_SCOPES, "#8B7CFF"),
    { id: "source", name: "Source", type: "text" },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        { value: "active", icon: "circle-check", color: "#2EE6A6" },
        { value: "disabled", icon: "circle-pause", color: "#8C93A0" },
      ],
    },
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};
