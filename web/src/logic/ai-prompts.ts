import type { Doc } from "../../../shared/types.ts";

/**
 * What the AI page asks Claude to do through the cave connector. Claude writes with its agent
 * token, so every change is logged and can be undone on the Agents page; edits to items read
 * from files reach those files only through the owner's `ai-sync --apply`.
 */

const RULES = [
  "Rules: never write a token, key, password or other secret into an item; keep every ‹redacted› as it is; never delete anything.",
  'Items whose source starts with "repo:" or "~/" come from files on my laptop: only improve their body; I write them back myself.',
].join(" ");

/** Bring the whole table up to date with what Claude can see in this conversation. */
export function updateAllPrompt(): string {
  return [
    'Update the "ai" collection in my Cave so it lists every AI capability I use.',
    '1. Read it: query the collection "ai" (all items, page through them).',
    '2. For each connector, MCP server, skill, plugin or project instruction available to you here that has no item yet, create one in "ai": a clear title, fields kind (connector, mcp-server, skill, plugin, rule, prompt or provider), surface (claude-app unless you know better), scope (account), source (manual) and status (active), and a short body: what it does and when to use it.',
    "3. Update the body of items that are outdated, unclear or duplicated by another (say which in your answer).",
    RULES,
    "Finish with a short list of what you added and changed.",
  ].join("\n");
}

/** Review and improve the items the owner ticked. */
export function improvePrompt(items: Doc[]): string {
  const list = items.map((d) => `- ${String(d.data._title ?? "Untitled")} (id ${d.id})`);
  return [
    'Improve these items of the "ai" collection in my Cave. Get each one by id, then update its body: clearer, shorter, current, with nothing lost that matters.',
    ...list,
    RULES,
    "Finish with what you changed in each.",
  ].join("\n");
}
