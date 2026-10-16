import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Doc } from "../../shared/types.ts";
import { pathOf, type Roots } from "./collect.ts";
import { hasRedaction } from "./redact.ts";

export type Ask = (question: string) => boolean;

/** The lines that go and come, for the owner to read before saying yes. */
export function diffLines(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const inB = new Set(b);
  const inA = new Set(a);
  return [
    ...a.filter((l) => !inB.has(l)).map((l) => `- ${l}`),
    ...b.filter((l) => !inA.has(l)).map((l) => `+ ${l}`),
  ].join("\n");
}

export interface Applied {
  /** Items written back, with the body that is now in the file. */
  written: { id: string; body: string }[];
  trashed: string[];
  skipped: { title: string; why: string }[];
}

/**
 * Writes Cave edits back to their files, asking before each one. Never writes a body that
 * holds a redacted value, never deletes a file: a deleted item's file moves to `.ai-trash/`
 * beside it, after asking.
 *
 * `read` maps each item id to the source this run read it from. Only those files are touched,
 * at the path they were read from: an item's stored `source` can be edited by anyone who
 * can write the collection (an agent, too), so it never decides where a write goes.
 */
export function applyEdits(
  edited: Doc[],
  deleted: Doc[],
  roots: Roots,
  ask: Ask,
  log: (line: string) => void,
  read: ReadonlyMap<string, string>,
): Applied {
  const result: Applied = { written: [], trashed: [], skipped: [] };
  const title = (d: Doc) => String(d.data._title ?? d.id);
  const pathFor = (doc: Doc) => {
    const source = read.get(doc.id);
    return source === undefined ? undefined : pathOf(source, roots);
  };

  for (const doc of edited) {
    const path = pathFor(doc);
    const body = String(doc.data._body ?? "");
    if (!path) {
      result.skipped.push({
        title: title(doc),
        why: "it isn't a file this sync read; edit it where it lives",
      });
      continue;
    }
    if (hasRedaction(body)) {
      result.skipped.push({
        title: title(doc),
        why: "it holds a redacted value; edit the file by hand",
      });
      continue;
    }
    const before = existsSync(path) ? readFileSync(path, "utf8") : "";
    log(`\n${path}\n${diffLines(before, body)}`);
    if (!ask(`Write this to ${path}?`)) {
      result.skipped.push({ title: title(doc), why: "you said no" });
      continue;
    }
    writeFileSync(path, body);
    result.written.push({ id: doc.id, body });
  }

  for (const doc of deleted) {
    const path = pathFor(doc);
    if (!path || !existsSync(path)) continue;
    const trash = join(dirname(path), ".ai-trash");
    if (!ask(`“${title(doc)}” was deleted in the Cave. Move ${path} to ${trash}?`)) {
      result.skipped.push({ title: title(doc), why: "you kept the file" });
      continue;
    }
    mkdirSync(trash, { recursive: true });
    const target = join(trash, `${Date.now()}-${basename(path)}`);
    renameSync(path, target);
    result.trashed.push(target);
  }
  return result;
}
