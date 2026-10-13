import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { localDateTime } from "../../shared/dates.ts";
import { MAX_BODY_BYTES, MAX_TITLE_CHARS } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { ToolOutcome } from "./read.ts";

const MAX_SUFFIX = 100;

// Characters Windows, macOS and Obsidian all accept in a file name.
const slug = (title: string) =>
  title
    .replace(/[^\p{L}\p{N} _-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim() || "note";

/**
 * Writes a new Markdown note under `<vault>/Inbox/`, the one place the app may create
 * files. `wx` never overwrites: a name that exists gets " 2", " 3", and so on.
 */
export async function addNote(
  vaultPath: string,
  agent: Agent,
  input: { title: string; body: string },
  now: number,
  timeZone: string | undefined,
): Promise<ToolOutcome> {
  if (!input.title.trim()) return { ok: false, error: "title is required" };
  if (input.title.length > MAX_TITLE_CHARS) {
    return { ok: false, error: `title is longer than ${MAX_TITLE_CHARS} characters` };
  }
  if (new TextEncoder().encode(input.body).length > MAX_BODY_BYTES) {
    return { ok: false, error: "body is larger than 100 kB" };
  }
  const local = localDateTime(new Date(now), timeZone);
  const stem = `${local.slice(0, 10)} ${local.slice(11, 13)}${local.slice(14, 16)} ${slug(input.title)}`;
  const content = `---\ncreated: ${local}\nsource: agent:${agent.name}\n---\n# ${input.title.trim()}\n\n${input.body.trim()}\n`;
  const dir = join(vaultPath, "Inbox");
  await mkdir(dir, { recursive: true });

  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const name = `${stem}${n === 1 ? "" : ` ${n}`}.md`;
    try {
      await writeFile(join(dir, name), content, { flag: "wx" });
      return { ok: true, value: { path: `Inbox/${name}` } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  return { ok: false, error: `too many notes named ${stem}` };
}
