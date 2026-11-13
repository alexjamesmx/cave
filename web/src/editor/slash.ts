import type { ChainedCommands } from "@tiptap/core";

/** One block the `/` menu can turn the current line into. */
export interface SlashItem {
  id: string;
  label: string;
  /** Shown before the label, so the menu reads at a glance. */
  emoji: string;
  /** Other words it is found by. */
  keywords: string;
  run(chain: ChainedCommands): ChainedCommands;
}

const DIAGRAM = "graph TD\n  A[Start] --> B[Done]";

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "Text",
    emoji: "¶",
    keywords: "paragraph plain",
    run: (c) => c.setParagraph(),
  },
  {
    id: "h1",
    label: "Heading 1",
    emoji: "H1",
    keywords: "title big",
    run: (c) => c.setHeading({ level: 1 }),
  },
  {
    id: "h2",
    label: "Heading 2",
    emoji: "H2",
    keywords: "subtitle",
    run: (c) => c.setHeading({ level: 2 }),
  },
  {
    id: "h3",
    label: "Heading 3",
    emoji: "H3",
    keywords: "small",
    run: (c) => c.setHeading({ level: 3 }),
  },
  {
    id: "todo",
    label: "Checklist",
    emoji: "☑️",
    keywords: "todo task checkbox list",
    run: (c) => c.toggleTaskList(),
  },
  {
    id: "bullets",
    label: "Bulleted list",
    emoji: "•",
    keywords: "list ul",
    run: (c) => c.toggleBulletList(),
  },
  {
    id: "numbers",
    label: "Numbered list",
    emoji: "1.",
    keywords: "list ol ordered",
    run: (c) => c.toggleOrderedList(),
  },
  {
    id: "quote",
    label: "Quote",
    emoji: "❝",
    keywords: "blockquote",
    run: (c) => c.toggleBlockquote(),
  },
  {
    id: "code",
    label: "Code",
    emoji: "</>",
    keywords: "snippet pre",
    run: (c) => c.toggleCodeBlock(),
  },
  {
    id: "diagram",
    label: "Diagram",
    emoji: "◇",
    keywords: "mermaid chart flow",
    run: (c) =>
      c.insertContent({
        type: "codeBlock",
        attrs: { language: "mermaid" },
        content: [{ type: "text", text: DIAGRAM }],
      }),
  },
  {
    id: "table",
    label: "Table",
    emoji: "▦",
    keywords: "grid",
    run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  },
  {
    id: "divider",
    label: "Divider",
    emoji: "—",
    keywords: "rule hr line",
    run: (c) => c.setHorizontalRule(),
  },
];

/** The query when the text before the caret in a line is `/` and a word: "/che" → "che". */
export function slashQuery(before: string): string | undefined {
  const match = /^\/([\p{L}\d ]{0,20})$/u.exec(before);
  return match ? (match[1] as string) : undefined;
}

/** The items a query finds, by the start of a word in the label or keywords. */
export function slashMatches(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) =>
    `${item.label} ${item.keywords}`
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.startsWith(q)),
  );
}
