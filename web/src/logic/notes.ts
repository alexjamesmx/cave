import { localDate, shortDay } from "../../../shared/dates.ts";
import { normTitle } from "../../../shared/money-stats.ts";
import { IDEAS_TOPIC, INBOX, normFolder } from "../../../shared/notes.ts";
import { colorToken } from "../../../shared/pages.ts";
import { SWATCHES } from "../../../shared/palette.ts";
import type { Doc } from "../../../shared/types.ts";
import { previousDay } from "./habits.ts";
import { titleOf } from "./views.ts";

const ALL = "/notes/all";

/** The path of one note in the Notes section; `search` keeps the open topic for the way back. */
export const notePath = (id: string, search = "") => `${ALL}/${encodeURIComponent(id)}${search}`;

/** Notes filtered to a topic: `/notes/all?topic=…`; no topic is All. */
export const topicPath = (topic: string) =>
  topic ? `${ALL}?topic=${encodeURIComponent(topic)}` : ALL;

/**
 * Where `[[Title]]` goes: the first note with that title (case ignored) in `near`, else in
 * `all`, opened in Notes.
 */
export function wikiResolver(near: Doc[], all: Doc[]) {
  return (title: string): { href: string } | undefined => {
    const key = title.toLowerCase();
    const same = (n: Doc) => titleOf(n).toLowerCase() === key;
    const hit = near.find(same) ?? all.find(same);
    return hit ? { href: notePath(hit.id) } : undefined;
  };
}

/** A note's topic is its folder, `/` nesting subtopics; "" when it has none. */
export const topicOf = (note: Doc) => normFolder(note.data.folder);

/** Whether a note shows under `topic`: its subtopics count, "" is All, Inbox holds no topic too. */
export function inTopic(note: Doc, topic: string): boolean {
  if (!topic) return true;
  const own = topicOf(note);
  return (topic === INBOX && own === "") || own === topic || own.startsWith(`${topic}/`);
}

const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)\s*/u;

/** A topic name's leading emoji, if it starts with one, and the rest. */
export function splitEmoji(name: string): { emoji: string; name: string } {
  const match = LEADING_EMOJI.exec(name);
  const rest = match ? name.slice(match[0].length) : "";
  return match?.[1] && rest ? { emoji: match[1], name: rest } : { emoji: "", name };
}

/** The topics the page names itself, with their own emoji. */
const BUILT_IN: Record<string, string> = { [INBOX]: "📥", [IDEAS_TOPIC]: "💡" };

/** How a card names its topic: the root's emoji, then the path as `Projects / Kitchen`. */
export function topicChip(topic: string): { emoji: string; text: string } {
  const [root = INBOX, ...sub] = (topic || INBOX).split("/");
  const own = splitEmoji(root);
  return { emoji: BUILT_IN[root] ?? own.emoji, text: [own.name, ...sub].join(" / ") };
}

export interface TopicRow {
  /** The folder it filters to. */
  path: string;
  /** Its last segment, without the emoji. */
  name: string;
  emoji: string;
  /** 0 for a topic, 1 for its subtopics, and so on. */
  depth: number;
  /** Its notes and its subtopics' notes. */
  count: number;
}

const byName = (a: string, b: string) =>
  splitEmoji(a).name.localeCompare(splitEmoji(b).name, undefined, {
    numeric: true,
    sensitivity: "base",
  });

/** Segment by segment, so each topic sits right above its subtopics. */
function comparePaths(a: string, b: string): number {
  const x = a.split("/");
  const y = b.split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const order = byName(x[i] as string, y[i] as string);
    if (order !== 0) return order;
  }
  return x.length - y.length;
}

/**
 * The owner's topics for the sidebar, A to Z as a tree, every level a row with its count.
 * Inbox and Ideas have rows of their own above them, so they are left out here.
 */
export function topicTree(notes: Doc[]): TopicRow[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const parts = topicOf(note).split("/").filter(Boolean);
    if (parts.length === 0 || parts[0] === INBOX || parts[0] === IDEAS_TOPIC) continue;
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => comparePaths(a, b))
    .map(([path, count]) => {
      const parts = path.split("/");
      const last = splitEmoji(parts.at(-1) as string);
      return { path, name: last.name, emoji: last.emoji, depth: parts.length - 1, count };
    });
}

// Grey reads as "nothing", so a topic never gets it.
const HUES = Object.values(SWATCHES).filter((c) => c !== SWATCHES.grey);
const FIXED: Record<string, string> = { [INBOX]: SWATCHES.sky, [IDEAS_TOPIC]: SWATCHES.yellow };

/**
 * A topic's colour, shared with its subtopics so a family reads as one: Inbox and Ideas their
 * own, any other one of the swatches by its name.
 */
export function topicColor(topic: string): string {
  const key = (topic || INBOX).split("/")[0] as string;
  const fixed = FIXED[key];
  if (fixed) return fixed;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return HUES[hash % HUES.length] as string;
}

/** A card's tint: the colour the owner gave the note (M12), else its topic's. */
export const noteColor = (note: Doc) => colorToken(note.data.color) ?? topicColor(topicOf(note));

/** Newest first, by when each note was written. */
export const newestFirst = (a: Doc, b: Doc) =>
  String(b.data._created ?? "").localeCompare(String(a.data._created ?? ""));

/** Search across title, topic and text, ignoring case and accents. */
export function matchesNote(note: Doc, query: string): boolean {
  const needle = normTitle(query);
  if (!needle) return true;
  const body = typeof note.data._body === "string" ? note.data._body : "";
  return normTitle(`${titleOf(note)} ${topicOf(note)} ${body}`).includes(needle);
}

/** The capture bar searches when its text starts with `/`: the query, else `undefined`. */
export const searchOf = (text: string) => (text.startsWith("/") ? text.slice(1).trim() : undefined);

/** What the capture bar saves: the first line is the title, the rest the body. */
export function captured(text: string): { title: string; body: string } | undefined {
  const [first = "", ...rest] = text.trim().split("\n");
  const title = first.trim();
  return title ? { title, body: rest.join("\n").trim() } : undefined;
}

/**
 * The start of a note as plain text for a card: Markdown marks dropped, list items set apart
 * with "·", a fenced diagram shown as "◇ diagram", other code kept, links reduced to their text.
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
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "· ")
    .replace(/^\s{0,3}(#{1,6}|>)\s+/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^· /, "");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const CHECK = /^\s{0,3}[-*+]\s+\[([ xX])\]\s+(.+)$/;

/** A card's face: the text as an excerpt, and the checklist items (`- [ ]`, `- [x]`) apart. */
export function cardFace(body: unknown): {
  text: string;
  checks: { done: boolean; text: string }[];
} {
  const checks: { done: boolean; text: string }[] = [];
  const rest: string[] = [];
  for (const line of typeof body === "string" ? body.split("\n") : []) {
    const match = CHECK.exec(line);
    if (match) checks.push({ done: match[1] !== " ", text: excerpt(match[2], 80) });
    else rest.push(line);
  }
  return { text: excerpt(rest.join("\n")), checks };
}

/** When a note was written, as its card says it: Today, Yesterday, Nov 10, or Nov 10, 2025. */
export function writtenOn(iso: unknown, today: string, zone: string | undefined): string {
  const at = typeof iso === "string" ? new Date(iso) : undefined;
  if (!at || Number.isNaN(at.getTime())) return "";
  const day = localDate(at, zone);
  if (day === today) return "Today";
  if (day === previousDay(today)) return "Yesterday";
  return day.slice(0, 4) === today.slice(0, 4)
    ? shortDay(day)
    : `${shortDay(day)}, ${day.slice(0, 4)}`;
}
