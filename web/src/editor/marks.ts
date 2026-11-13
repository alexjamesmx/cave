import { Extension, InputRule, Mark, mergeAttributes, Node } from "@tiptap/core";
import { isSafeUrl } from "../../../shared/fields.ts";
import { TEXT_COLORS, type TextColor } from "../ui/Markdown.tsx";

/**
 * The Cave's own Markdown, as Tiptap extensions that parse it and write it back unchanged:
 * `[[Title]]` / `[[Title|label]]`, `:red[text]`, `==text==`, images (shown as a link, never
 * loaded, as the reader does) and raw HTML (kept as text, as the reader shows it).
 */

const WIKILINK = /^\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/;

export const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { title: { default: "" }, label: { default: null } };
  },
  parseHTML() {
    return [{ tag: "a[data-wikilink]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { "data-wikilink": node.attrs.title, class: "wikilink" }),
      node.attrs.label ?? node.attrs.title,
    ];
  },
  renderText({ node }) {
    return node.attrs.label ?? node.attrs.title;
  },

  markdownTokenizer: {
    name: "wikilink",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenize(src) {
      const match = WIKILINK.exec(src);
      if (!match) return undefined;
      return {
        type: "wikilink",
        raw: match[0],
        title: (match[1] as string).trim(),
        label: match[2]?.trim(),
      };
    },
  },
  parseMarkdown: (token) => ({
    type: "wikilink",
    attrs: { title: token.title, label: token.label ?? null },
  }),
  renderMarkdown: (node) => {
    const { title, label } = node.attrs ?? {};
    return label ? `[[${title}|${label}]]` : `[[${title}]]`;
  },

  // Typing the closing `]]` turns `[[Title]]` into a link, brackets and all (Tiptap's
  // nodeInputRule would keep them: it replaces only the first group).
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]$/,
        handler: ({ state, range, match }) => {
          const title = (match[1] as string).trim();
          const label = match[2]?.trim() || null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ title, label }));
        },
      }),
    ];
  },
});

const COLOR = new RegExp(`^:(${Object.keys(TEXT_COLORS).join("|")})\\[([^\\]\\n]+)\\]`);

export const TextColorMark = Mark.create({
  name: "textColor",
  addAttributes() {
    return { color: { default: "red" } };
  },
  parseHTML() {
    return [{ tag: "span[data-color]", getAttrs: (el) => ({ color: el.dataset.color }) }];
  },
  renderHTML({ mark }) {
    const token = TEXT_COLORS[mark.attrs.color as TextColor] ?? "muted";
    return [
      "span",
      { "data-color": mark.attrs.color, class: "md-color", style: `color: var(--${token})` },
      0,
    ];
  },
  markdownTokenizer: {
    name: "textColor",
    level: "inline",
    start: (src) => src.search(/:[a-z]+\[/),
    tokenize(src, _tokens, lexer) {
      const match = COLOR.exec(src);
      if (!match) return undefined;
      return {
        type: "textColor",
        raw: match[0],
        color: match[1],
        tokens: lexer.inlineTokens(match[2] as string),
      };
    },
  },
  parseMarkdown: (token, h) =>
    h.applyMark("textColor", h.parseInline(token.tokens ?? []), { color: token.color }),
  renderMarkdown: (node, h) => `:${node.attrs?.color ?? "red"}[${h.renderChildren(node)}]`,
});

export const HighlightMark = Mark.create({
  name: "highlight",
  parseHTML() {
    return [{ tag: "mark" }];
  },
  renderHTML() {
    return ["mark", { class: "md-mark" }, 0];
  },
  markdownTokenizer: {
    name: "highlight",
    level: "inline",
    start: (src) => src.indexOf("=="),
    tokenize(src, _tokens, lexer) {
      const match = /^==([^=\n]+)==/.exec(src);
      if (!match) return undefined;
      return {
        type: "highlight",
        raw: match[0],
        tokens: lexer.inlineTokens(match[1] as string),
      };
    },
  },
  parseMarkdown: (token, h) => h.applyMark("highlight", h.parseInline(token.tokens ?? [])),
  renderMarkdown: (node, h) => `==${h.renderChildren(node)}==`,
});

/** An image is a link to its address: notes never load anything from elsewhere. */
export const ImageLink = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { src: { default: "" }, alt: { default: "" }, title: { default: null } };
  },
  parseHTML() {
    return [{ tag: "a[data-image]" }];
  },
  renderHTML({ node }) {
    const label = `🖼 ${node.attrs.alt || "image"}`;
    return isSafeUrl(node.attrs.src)
      ? [
          "a",
          {
            "data-image": "",
            class: "md-image-link",
            href: node.attrs.src,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          label,
        ]
      : ["span", { "data-image": "" }, label];
  },
  parseMarkdown: (token) => ({
    type: "image",
    attrs: { src: token.href ?? "", alt: token.text ?? "", title: token.title ?? null },
  }),
  renderMarkdown: (node) => {
    const { src, alt, title } = node.attrs ?? {};
    return `![${alt ?? ""}](${src ?? ""}${title ? ` "${title}"` : ""})`;
  },
});

/** Raw HTML stays text, as the reader has always shown it; nothing in it is interpreted. */
export const LiteralHtml = Extension.create({
  name: "literalHtml",
  markdownTokenName: "html",
  parseMarkdown: (token) => {
    const text = (token.text ?? token.raw ?? "").replace(/\s+$/, "");
    if (!text) return [];
    const node = { type: "text", text };
    return token.block ? { type: "paragraph", content: [node] } : node;
  },
});
