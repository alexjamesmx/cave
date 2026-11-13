import type { AnyExtension, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Marked, type marked } from "marked";
import { noteExtensions } from "./extensions.ts";

type Encoder = (text: string, node: JSONContent, parent?: JSONContent) => string;

/**
 * Text written back as Markdown stays readable: `&`, `<` and `>` become entities only where
 * Markdown would read them as one, a tag or a quote (Tiptap encodes every one, so "Arrays &
 * hashing" would be stored as "Arrays &amp; hashing"). Code is written as it is.
 */
function readableText(text: string): string {
  return text
    .replace(/&(?=#?\w+;)/g, "&amp;")
    .replace(/<(?=[A-Za-z/!?])/g, "&lt;")
    .replace(/^>/, "&gt;")
    .replace(/([\\`*_[\]~])/g, "\\$1");
}

/**
 * A manager over `extensions` that writes text as above. It gets a Marked of its own: Tiptap
 * adds its tokenizers to whatever instance it is given, and the shared one would gain a copy
 * each time a manager is made.
 */
export function noteMarkdownManager(extensions: AnyExtension[] = noteExtensions()) {
  const manager = new MarkdownManager({
    marked: new Marked() as unknown as typeof marked,
    extensions,
    markedOptions: { gfm: true },
  });
  // A private method in Tiptap's types; the override is pinned by markdown.test.ts.
  const own = manager as unknown as { encodeTextForMarkdown: Encoder; codeTypes: Set<string> };
  own.encodeTextForMarkdown = (text, node, parent) => {
    const inCode =
      (parent?.type !== undefined && own.codeTypes.has(parent.type)) ||
      (node.marks ?? []).some((m) => own.codeTypes.has(typeof m === "string" ? m : m.type));
    return inCode ? text : readableText(text);
  };
  return manager;
}

let shared: MarkdownManager | undefined;
const manager = () => {
  shared ??= noteMarkdownManager();
  return shared;
};

/** A note's Markdown as the editor's document. */
export const parseNote = (markdown: string): JSONContent => manager().parse(markdown);

/**
 * The editor's document as Markdown. An empty paragraph is a blank line: Tiptap writes
 * `&nbsp;` to keep it, which would show on cards and in search.
 */
export const noteMarkdown = (doc: JSONContent): string =>
  manager()
    .serialize(doc)
    .replace(/^&nbsp;$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const MARKDOWN = /^(#{1,6} |\s*[-*+] |\s*\d+\. |> |```)|\*\*|\[\[|\]\(|==\S/m;

/** Whether pasted plain text reads as Markdown, so it is pasted formatted. */
export const looksLikeMarkdown = (text: string) => MARKDOWN.test(text);
