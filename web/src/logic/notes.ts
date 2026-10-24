import { INBOX, normFolder } from "../../../shared/notes.ts";
import type { Doc } from "../../../shared/types.ts";
import { wikilinkTitles } from "../ui/Markdown.tsx";
import { titleOf } from "./views.ts";

const text = (v: unknown) => (typeof v === "string" ? v : "");
const live = (d: Doc) => d.data._deleted !== true;

/** Lower case without accents, so "accion" finds "acción". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export interface FolderNode {
  path: string;
  name: string;
  /** Notes in this folder and every folder under it. */
  count: number;
  children: FolderNode[];
}

/** The folder tree from notes' `folder`, with counts; Inbox first, then by name. */
export function folderTree(notes: Doc[]): FolderNode[] {
  const root: FolderNode = { path: "", name: "", count: 0, children: [] };
  for (const note of notes.filter(live)) {
    let node = root;
    node.count++;
    let path = "";
    for (const part of normFolder(note.data.folder).split("/").filter(Boolean)) {
      path = path ? `${path}/${part}` : part;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { path, name: part, count: 0, children: [] };
        node.children.push(child);
      }
      child.count++;
      node = child;
    }
  }
  const sort = (nodes: FolderNode[]): FolderNode[] =>
    nodes
      .sort((a, b) =>
        a.path === INBOX
          ? -1
          : b.path === INBOX
            ? 1
            : a.name < b.name
              ? -1
              : a.name > b.name
                ? 1
                : 0,
      )
      .map((n) => ({ ...n, children: sort(n.children) }));
  return sort(root.children);
}

/** Notes in a folder or under it; "" is every note. */
export const inFolder = (notes: Doc[], folder: string) =>
  notes.filter((n) => {
    const f = normFolder(n.data.folder);
    return live(n) && (!folder || f === folder || f.startsWith(`${folder}/`));
  });

interface SearchHit {
  doc: Doc;
  inTitle: boolean;
  bodyHits: number;
  snippet: string;
}

const SNIPPET = 60;

/**
 * Notes matching every word of `query` in title or body, offline: accent- and
 * case-insensitive, title matches first, then by how often the body matches.
 */
export function searchNotes(notes: Doc[], query: string): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const doc of notes.filter(live)) {
    const title = fold(titleOf(doc));
    const raw = text(doc.data._body);
    const body = fold(raw);
    if (!words.every((w) => title.includes(w) || body.includes(w))) continue;
    const bodyHits = words.reduce((n, w) => n + body.split(w).length - 1, 0);
    const first = Math.min(...words.map((w) => body.indexOf(w)).filter((i) => i >= 0));
    const at = Number.isFinite(first) ? first : 0;
    // Folding keeps lengths for Latin text, so the index finds the same place in the raw body.
    const start = Math.max(0, at - SNIPPET / 2);
    const snippet = raw
      .slice(start, start + SNIPPET * 2)
      .replace(/\s+/g, " ")
      .trim();
    hits.push({
      doc,
      inTitle: words.some((w) => title.includes(w)),
      bodyHits,
      snippet: `${start > 0 ? "…" : ""}${snippet}${start + SNIPPET * 2 < raw.length ? "…" : ""}`,
    });
  }
  return hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.bodyHits - a.bodyHits);
}

/** The live note with this title, ignoring case. */
export const noteByTitle = (notes: Doc[], title: string) => {
  const t = fold(title.trim());
  return notes.find((n) => live(n) && fold(titleOf(n).trim()) === t);
};

/** Notes this one links to (existing or not), and notes that link to it. */
export function links(notes: Doc[], note: Doc) {
  const outgoing = wikilinkTitles(text(note.data._body)).map((title) => ({
    title,
    doc: noteByTitle(notes, title),
  }));
  const me = fold(titleOf(note).trim());
  const backlinks = notes.filter(
    (n) =>
      live(n) && n.id !== note.id && wikilinkTitles(text(n.data._body)).some((t) => fold(t) === me),
  );
  return { outgoing, backlinks };
}
