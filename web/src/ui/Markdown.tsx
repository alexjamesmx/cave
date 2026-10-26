import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeUrl } from "../../../shared/fields.ts";
import { MarkdownDiagram } from "./DiagramSvg.tsx";

/**
 * The one Markdown renderer (M9): notes, the drawer's preview, diary entries. It builds React
 * elements from a syntax tree, never an HTML string, so:
 * - raw HTML in the text shows as text;
 * - only http, https and mailto URLs become links, and they open in a new tab;
 * - images are never loaded: an image shows as a link to its address;
 * - `[[Title]]` and `[[Title|label]]` link to the note with that title, found case-insensitively;
 * - a ```mermaid code block is drawn as a diagram (SVG cleaned of styles and scripts);
 * - `:red[text]` colours text with one of `TEXT_COLORS`, `==text==` highlights it.
 */

const NOTE = "cave-note:";
const COLOR = "cave-color:";
const MARK = "cave-mark:";
const WIKILINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

/** The colours text can take, each one of the palette's tokens. */
export const TEXT_COLORS = {
  red: "bad",
  orange: "orange",
  yellow: "warn",
  green: "ok",
  teal: "teal",
  blue: "wait",
  purple: "vio",
  grey: "muted",
} as const;
export type TextColor = keyof typeof TEXT_COLORS;
const COLORED = new RegExp(`:(${Object.keys(TEXT_COLORS).join("|")})\\[([^\\]\\n]+)\\]`, "g");
const HIGHLIGHT = /==([^=\n]+)==/g;

const escapeLabel = (s: string) => s.replace(/[\\[\]]/g, (c) => `\\${c}`);
const encodeTitle = (s: string) =>
  encodeURIComponent(s.trim()).replace(/\(/g, "%28").replace(/\)/g, "%29");

/**
 * The Cave's own inline marks as ordinary Markdown links, so the label keeps its formatting:
 * `[[Title|label]]` to `cave-note:Title`, `:red[text]` to `cave-color:red`, `==text==` to
 * `cave-mark:`. Code, inline or fenced, is left alone.
 */
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
            : part
                .replace(
                  WIKILINK,
                  (_, title: string, label?: string) =>
                    `[${escapeLabel((label ?? title).trim())}](${NOTE}${encodeTitle(title)})`,
                )
                .replace(
                  COLORED,
                  (_, color: string, inner: string) => `[${inner}](${COLOR}${color})`,
                )
                .replace(HIGHLIGHT, (_, inner: string) => `[${inner}](${MARK})`),
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
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

/** The source of a `<pre><code class="language-mermaid">` block, if `pre` is one. */
export function mermaidSource(pre: HastNode | undefined): string | undefined {
  const code = pre?.children?.find((c) => c.type === "element");
  const classes = code?.tagName === "code" ? code.properties?.className : undefined;
  if (!Array.isArray(classes) || !classes.includes("language-mermaid")) return undefined;
  return (code?.children ?? []).map((c) => (c.type === "text" ? (c.value ?? "") : "")).join("");
}

/** Raw HTML becomes plain text: shown as written, never interpreted. */
function htmlAsText() {
  const walk = (node: Node) => {
    if (node.type === "html") node.type = "text";
    for (const child of node.children ?? []) walk(child);
  };
  return (tree: Node) => walk(tree);
}

const OWN = [NOTE, COLOR, MARK];
const urlTransform = (url: string) =>
  OWN.some((p) => url.startsWith(p)) || isSafeUrl(url) ? url : "";

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
      if (href?.startsWith(COLOR)) {
        const color = href.slice(COLOR.length) as TextColor;
        return TEXT_COLORS[color] ? (
          <span className="md-color" style={{ color: `var(--${TEXT_COLORS[color]})` }}>
            {children}
          </span>
        ) : (
          <span>{children}</span>
        );
      }
      if (href === MARK) return <mark className="md-mark">{children}</mark>;
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
    pre({ node, children }) {
      const source = mermaidSource(node as HastNode | undefined);
      return source === undefined ? <pre>{children}</pre> : <MarkdownDiagram source={source} />;
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
