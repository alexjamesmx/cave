import type { AnyExtension } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { isSafeUrl } from "../../../shared/fields.ts";
import { HighlightMark, ImageLink, LiteralHtml, TextColorMark, Wikilink } from "./marks.ts";

/**
 * What a note can hold, the same for the editor and for reading and writing Markdown, so
 * nothing the editor shows is lost on save. Underline is left out: Markdown has no mark for it.
 * The editor passes its own views for code blocks (a mermaid one is drawn) and wikilinks.
 */
export function noteExtensions(
  views: { codeBlock?: AnyExtension; wikilink?: AnyExtension } = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: true,
        autolink: true,
        isAllowedUri: (url) => isSafeUrl(url),
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      },
    }),
    views.codeBlock ?? CodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit,
    views.wikilink ?? Wikilink,
    TextColorMark,
    HighlightMark,
    ImageLink,
    LiteralHtml,
  ];
}
