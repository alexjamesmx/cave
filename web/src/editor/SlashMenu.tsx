import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { type SlashItem, slashMatches, slashQuery } from "./slash.ts";

interface Open {
  query: string;
  from: number;
  to: number;
}

/** Where the `/` menu is, if the line before the caret asks for it. */
function slashAt(editor: Editor): Open | undefined {
  const { $from, empty } = editor.state.selection;
  if (!empty || $from.parent.type.name !== "paragraph") return undefined;
  const query = slashQuery($from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc"));
  return query === undefined ? undefined : { query, from: $from.start(), to: $from.pos };
}

export interface SlashKeys {
  /** Handles a key while the menu is open; true when it used it. */
  onKey(key: string): boolean;
}

/**
 * The `/` menu (Notion's): on an empty line, `/` and a word list the blocks it can become;
 * arrows and Enter pick one, Escape closes it.
 */
export function SlashMenu({
  editor,
  keys,
}: {
  editor: Editor;
  keys: { current: SlashKeys | undefined };
}) {
  const open = useEditorState({ editor, selector: ({ editor: e }) => slashAt(e) });
  const [index, setIndex] = useState(0);
  const [closedAt, setClosedAt] = useState<number>();
  const list = useRef<HTMLDivElement>(null);
  const items = open ? slashMatches(open.query) : [];
  const shown = open !== undefined && closedAt !== open.from && items.length > 0;

  // A new query starts at the top; leaving the line reopens the menu next time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the query changes
  useEffect(() => setIndex(0), [open?.query]);
  useEffect(() => {
    if (!open) setClosedAt(undefined);
  }, [open]);

  const choose = (item: SlashItem | undefined) => {
    if (!item || !open) return;
    item.run(editor.chain().focus().deleteRange({ from: open.from, to: open.to })).run();
  };

  keys.current = {
    onKey(key) {
      if (!shown || !open) return false;
      if (key === "ArrowDown") setIndex((i) => (i + 1) % items.length);
      else if (key === "ArrowUp") setIndex((i) => (i - 1 + items.length) % items.length);
      else if (key === "Enter" || key === "Tab") choose(items[index]);
      else if (key === "Escape") setClosedAt(open.from);
      else return false;
      return true;
    },
  };

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  });

  if (!shown || !open) return null;
  const at = editor.view.coordsAtPos(open.from);
  return (
    <div
      ref={list}
      className="nb-slash"
      role="listbox"
      aria-label="Blocks"
      style={{ left: at.left, top: at.bottom + 6 }}
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          role="option"
          tabIndex={-1}
          aria-selected={i === index}
          className="nb-slash-item"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setIndex(i)}
          onClick={() => choose(item)}
          onKeyDown={() => undefined}
        >
          <span className="nb-slash-emoji" aria-hidden="true">
            {item.emoji}
          </span>
          {item.label}
        </div>
      ))}
    </div>
  );
}
