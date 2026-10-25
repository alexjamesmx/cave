/**
 * The Markdown editor's toolbar (M12 part 6): pure edits on a text and a selection, so the
 * editor only has to put the result back into the textarea.
 */

export interface Edit {
  text: string;
  start: number;
  end: number;
}

/** Wraps the selection (or inserts `placeholder` wrapped) and keeps the inner text selected. */
export function wrap(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = "text",
): Edit {
  const inner = start === end ? placeholder : text.slice(start, end);
  const next = `${text.slice(0, start)}${before}${inner}${after}${text.slice(end)}`;
  return { text: next, start: start + before.length, end: start + before.length + inner.length };
}

const lineBounds = (text: string, start: number, end: number) => {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const stop = text.indexOf("\n", end);
  return { from, to: stop === -1 ? text.length : stop };
};

/**
 * Puts `prefix` at the start of every selected line, or takes it off when every line has it
 * already. A heading prefix replaces another heading level instead of stacking.
 */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: string): Edit {
  const { from, to } = lineBounds(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const heading = /^#{1,6} $/.test(prefix);
  const strip = (line: string) =>
    heading
      ? line.replace(/^#{1,6} /, "")
      : line.startsWith(prefix)
        ? line.slice(prefix.length)
        : line;
  const all = lines.every((l) => l.startsWith(prefix));
  const next = lines.map((l) => (all ? l.slice(prefix.length) : `${prefix}${strip(l)}`));
  const block = next.join("\n");
  return {
    text: `${text.slice(0, from)}${block}${text.slice(to)}`,
    start: from,
    end: from + block.length,
  };
}

/** A link around the selection: `[text](url)` with the URL selected for typing. */
export function insertLink(text: string, start: number, end: number): Edit {
  const label = start === end ? "link" : text.slice(start, end);
  const url = "https://";
  const next = `${text.slice(0, start)}[${label}](${url})${text.slice(end)}`;
  const urlStart = start + label.length + 3;
  return { text: next, start: urlStart, end: urlStart + url.length };
}

export type Action =
  | "heading"
  | "bold"
  | "italic"
  | "list"
  | "checklist"
  | "quote"
  | "code"
  | "link";

/** One toolbar action applied to a text and selection. */
export function apply(action: Action, text: string, start: number, end: number): Edit {
  switch (action) {
    case "heading":
      return toggleLinePrefix(text, start, end, "## ");
    case "bold":
      return wrap(text, start, end, "**", "**");
    case "italic":
      return wrap(text, start, end, "_", "_");
    case "list":
      return toggleLinePrefix(text, start, end, "- ");
    case "checklist":
      return toggleLinePrefix(text, start, end, "- [ ] ");
    case "quote":
      return toggleLinePrefix(text, start, end, "> ");
    case "code":
      return text.slice(start, end).includes("\n")
        ? wrap(text, start, end, "```\n", "\n```", "code")
        : wrap(text, start, end, "`", "`", "code");
    case "link":
      return insertLink(text, start, end);
  }
}

/** The keyboard shortcut (with Ctrl or ⌘) for an action, or none. */
export const SHORTCUTS: Partial<Record<string, Action>> = {
  b: "bold",
  i: "italic",
  k: "link",
  e: "code",
};
