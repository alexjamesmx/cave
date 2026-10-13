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
}

const baseName = (path: string) => (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");

const TITLE_LINE_RE = /^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;

// Keys every source drops: `bucket` is obsolete in the ledger; `created` becomes `_created`.
const DROPPED = new Set(["bucket", "created"]);

/** Turns one vault note into item data. Empty frontmatter values are left out, not guessed. */
export function mapNote(source: SourceId, note: Note, ctx: MapContext): Mapped {
  const problems: string[] = [];
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

function createdUtc(created: unknown, ctx: MapContext, problems: string[]): string {
  if (typeof created === "string") {
    const utc = localToUtcIso(created, ctx.timeZone);
    if (utc) return utc;
    problems.push(`created "${created}" is not a local date; used the file's creation time`);
  }
  return new Date(ctx.createdMs).toISOString();
}
