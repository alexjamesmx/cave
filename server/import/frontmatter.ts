export interface Note {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Splits a Markdown note into YAML frontmatter and body. Throws on invalid YAML. */
export function parseNote(text: string): Note {
  const source = text.replace(/^﻿/, "");
  const m = FENCE_RE.exec(source);
  if (!m) return { frontmatter: {}, body: source };
  const parsed: unknown = Bun.YAML.parse(m[1] ?? "");
  const frontmatter =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { frontmatter, body: source.slice(m[0].length) };
}
