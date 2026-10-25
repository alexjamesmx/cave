import { normTitle } from "../../../shared/money-stats.ts";
import { normFolder } from "../../../shared/notes.ts";
import { isLive } from "../../../shared/project-status.ts";
import type { Doc } from "../../../shared/types.ts";
import { projectPath } from "../app/router.ts";
import { titleOf } from "./views.ts";

export const NO_TOPIC = "No topic";

/** The path of one note in the Notes section. */
export const notePath = (id: string) => `/notes/all/${encodeURIComponent(id)}`;

/** The path of one page of a project. */
export const pagePath = (project: string, note: string) =>
  `${projectPath(project, "pages")}/${encodeURIComponent(note)}`;

/**
 * Where `[[Title]]` goes: the first note with that title (case ignored) in `near`, else in
 * `all`; a live project's page opens in its project, any other note in Notes.
 */
export function wikiResolver(near: Doc[], all: Doc[], projects: Doc[]) {
  const live = new Set(projects.filter(isLive).map((p) => p.id));
  return (title: string): { href: string } | undefined => {
    const key = title.toLowerCase();
    const same = (n: Doc) => titleOf(n).toLowerCase() === key;
    const hit = near.find(same) ?? all.find(same);
    if (!hit) return undefined;
    const owner = hit.data.project;
    return {
      href:
        typeof owner === "string" && live.has(owner) ? pagePath(owner, hit.id) : notePath(hit.id),
    };
  };
}

/**
 * The notes the Notes section shows: live ones that are no live project's page. A page whose
 * project was deleted comes back here rather than vanishing.
 */
export function looseNotes(notes: Doc[], projects: Doc[]): Doc[] {
  const live = new Set(projects.filter(isLive).map((p) => p.id));
  return notes.filter(
    (n) => isLive(n) && !(typeof n.data.project === "string" && live.has(n.data.project)),
  );
}

/** A note's topic is its folder; notes without one share "No topic". */
export const topicOf = (note: Doc) => normFolder(note.data.folder) || NO_TOPIC;

const newestFirst = (a: Doc, b: Doc) =>
  String(b.data._created ?? "").localeCompare(String(a.data._created ?? ""));

/** Notes by topic, topics A to Z with "No topic" last, each newest first. */
export function groupByTopic(notes: Doc[]): { topic: string; notes: Doc[] }[] {
  const groups = new Map<string, Doc[]>();
  for (const n of notes) groups.set(topicOf(n), [...(groups.get(topicOf(n)) ?? []), n]);
  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === NO_TOPIC ? 1 : b === NO_TOPIC ? -1 : a.localeCompare(b, undefined, { numeric: true }),
    )
    .map(([topic, list]) => ({ topic, notes: list.sort(newestFirst) }));
}

/** Search across title, topic and text, ignoring case and accents. */
export function matchesNote(note: Doc, query: string): boolean {
  const needle = normTitle(query);
  if (!needle) return true;
  const body = typeof note.data._body === "string" ? note.data._body : "";
  return normTitle(`${titleOf(note)} ${topicOf(note)} ${body}`).includes(needle);
}

/**
 * The start of a note as plain text for a card: Markdown marks dropped, a fenced diagram shown
 * as "◇ diagram", other code kept, links reduced to their text.
 */
export function excerpt(body: unknown, max = 200): string {
  if (typeof body !== "string") return "";
  const text = body
    .replace(/```mermaid[\s\S]*?(```|$)/g, " ◇ diagram ")
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, title: string, label?: string) => label ?? title,
    )
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
