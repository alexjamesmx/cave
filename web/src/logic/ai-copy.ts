import type { Doc } from "../../../shared/types.ts";

const text = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Chosen rules, skills and the rest as one Markdown document, to paste into any assistant.
 * JSON (an MCP server, settings) goes in a code block; everything else stays as written.
 */
export function copyForAnotherAi(items: Doc[]): string {
  const sections = items.map((d) => {
    const body = text(d.data._body).trim();
    const json = body.startsWith("{") || body.startsWith("[");
    const meta = [text(d.data.kind), text(d.data.surface)].filter(Boolean).join(" · ");
    return [
      `## ${text(d.data._title) || d.id}${meta ? ` (${meta})` : ""}`,
      "",
      json ? `\`\`\`json\n${body}\n\`\`\`` : body,
    ].join("\n");
  });
  return [
    "# My AI setup",
    "",
    "Rules, skills and tools I use with AI assistants. Secrets have been removed.",
    "",
    ...sections.flatMap((s) => [s, ""]),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}
