import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeUrl } from "../../../shared/fields.ts";

/**
 * The one Markdown renderer (M9): notes, the drawer's preview, diary entries. It builds React
 * elements from a syntax tree, never an HTML string, so:
 * - raw HTML in the text shows as text;
 * - only http, https and mailto URLs become links, and they open in a new tab;
 * - images are never loaded: an image shows as a link to its address;
 * - `[[Title]]` and `[[Title|label]]` link to the note with that title, found case-insensitively.
 */

const NOTE = "cave-note:";
const WIKILINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

const escapeLabel = (s: string) => s.replace(/[\\[\]]/g, (c) => `\\${c}`);
const encodeTitle = (s: string) =>
  encodeURIComponent(s.trim()).replace(/\(/g, "%28").replace(/\)/g, "%29");

/** `[[Title|label]]` as an ordinary Markdown link to `cave-note:Title`; code is left alone. */
export function wikilinksToMarkdown(text: string): string {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((part, i) =>
          i % 2 === 1
            ? part
            : part.replace(
                WIKILINK,
                (_, title: string, label?: string) =>
                  `[${escapeLabel((label ?? title).trim())}](${NOTE}${encodeTitle(title)})`,
              ),
        )
        .join("");
    })
    .join("\n");
}

/** The titles a body links to with `[[...]]`, in order, each once; for Links and backlinks. */
export function wikilinkTitles(text: string): string[] {
  const titles = [...text.matchAll(WIKILINK)].map((m) => (m[1] as string).trim());
  return [...new Set(titles)];
}

type Node = { type: string; value?: string; children?: Node[] };

/** Raw HTML becomes plain text: shown as written, never interpreted. */
function htmlAsText() {
  const walk = (node: Node) => {
    if (node.type === "html") node.type = "text";
    for (const child of node.children ?? []) walk(child);
  };
  return (tree: Node) => walk(tree);
}

const urlTransform = (url: string) => (url.startsWith(NOTE) || isSafeUrl(url) ? url : "");

interface WikiTarget {
  href: string;
}

export function MarkdownView({
  text,
  resolve,
  onMissing,
}: {
  text: string;
  /** The note a wikilink names, if it exists. */
  resolve?: (title: string) => WikiTarget | undefined;
  /** A wikilink to a note that doesn't exist yet. */
  onMissing?: (title: string) => void;
}) {
  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith(NOTE)) {
        const title = decodeURIComponent(href.slice(NOTE.length));
        const target = resolve?.(title);
        if (target)
          return (
            <a className="wikilink" href={target.href}>
              {children}
            </a>
          );
        return (
          <button
            type="button"
            className="wikilink missing"
            title={`No note “${title}” yet`}
            onClick={() => onMissing?.(title)}
          >
            {children}
          </button>
        );
      }
      if (!href) return <span>{children}</span>;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      const label: ReactNode = alt || "image";
      return typeof src === "string" && isSafeUrl(src) ? (
        <a href={src} target="_blank" rel="noopener noreferrer" className="md-image-link">
          🖼 {label}
        </a>
      ) : (
        <span>{label}</span>
      );
    },
  };
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm, htmlAsText]}
        urlTransform={urlTransform}
        components={components}
      >
        {wikilinksToMarkdown(text)}
      </Markdown>
    </div>
  );
}
