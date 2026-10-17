import { localToUtcIso } from "../../shared/time.ts";
import type { Note } from "./frontmatter.ts";
import type { SourceId } from "./sources.ts";

export interface MapContext {
  path: string;
  createdMs: number;
  timeZone: string;
}

export interface Mapped {
  data: Record<string, unknown>;
  problems: string[];
  /** For notes: frontmatter keys moved into the body. */
  extraKeys?: string[];
}

const baseName = (path: string) => (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");

const TITLE_LINE_RE = /^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;

// Keys every source drops: `bucket` is obsolete in the ledger; `created` becomes `_created`.
const DROPPED = new Set(["bucket", "created"]);

/** Turns one vault note into item data. Empty frontmatter values are left out, not guessed. */
export function mapNote(source: SourceId, note: Note, ctx: MapContext): Mapped {
  const problems: string[] = [];
  if (source === "notes") return mapFreeNote(note, ctx, problems);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(note.frontmatter)) {
    if (value === null || value === "" || DROPPED.has(key)) continue;
    data[key] = value;
  }

  let body = note.body;
  let title = baseName(ctx.path);
  if (source === "ledger") title = title.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
  if (source === "tasks") {
    const heading = TITLE_LINE_RE.exec(body);
    if (heading) {
      title = heading[1] as string;
      body = body.slice(heading[0].length);
    }
  }
  if (source === "leetcode") {
    if ("leetcode_id" in data) {
      data.number = data.leetcode_id;
      delete data.leetcode_id;
    }
    if (typeof data.status === "string") data.status = data.status.trim();
  }

  data._title = title;
  if (body.trim()) data._body = body.trim();
  data._created = createdUtc(note.frontmatter.created, ctx, problems);
  return { data, problems };
}

// Notes keep only what Obsidian adds on its own as metadata; anything else is the owner's.
const NOTE_META = new Set(["created", "tags"]);

/**
 * A free note: its title is the file name, its folder the file's directory, and any
 * frontmatter beyond `created` and `tags` goes on top of the body as a short list.
 */
function mapFreeNote(note: Note, ctx: MapContext, problems: string[]): Mapped {
  const extra = Object.entries(note.frontmatter).filter(
    ([key, value]) => !NOTE_META.has(key) && value !== null && value !== "",
  );
  const block = extra.map(
    ([key, value]) => `- ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
  const body = [block.join("\n"), note.body.trim()].filter(Boolean).join("\n\n");
  const dir = ctx.path.split("/").slice(0, -1).join("/");
  return {
    data: {
      _title: baseName(ctx.path),
      ...(body ? { _body: body } : {}),
      folder: dir,
      source: "import",
      _created: createdUtc(note.frontmatter.created, ctx, problems),
    },
    problems,
    ...(extra.length > 0 ? { extraKeys: extra.map(([key]) => key) } : {}),
  };
}

function createdUtc(created: unknown, ctx: MapContext, problems: string[]): string {
  if (typeof created === "string") {
    const utc = localToUtcIso(created, ctx.timeZone);
    if (utc) return utc;
    problems.push(`created "${created}" is not a local date; used the file's creation time`);
  }
  return new Date(ctx.createdMs).toISOString();
}
