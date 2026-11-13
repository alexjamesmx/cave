import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useState } from "react";
import { isSafeUrl } from "../../../shared/fields.ts";
import { Icon } from "../ui/icon.tsx";
import { TEXT_COLORS, type TextColor } from "../ui/Markdown.tsx";

type Tool = {
  id: string;
  icon: string;
  title: string;
  active: (e: Editor) => boolean;
  run: (e: Editor) => void;
};

const TOOLS: Tool[] = [
  {
    id: "heading",
    icon: "heading-2",
    title: "Heading",
    active: (e) => e.isActive("heading"),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "bold",
    icon: "bold",
    title: "Bold (Ctrl+B)",
    active: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: "italic",
    icon: "italic",
    title: "Italic (Ctrl+I)",
    active: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: "checklist",
    icon: "list-checks",
    title: "Checklist",
    active: (e) => e.isActive("taskList"),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "list",
    icon: "list",
    title: "List",
    active: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "quote",
    icon: "quote",
    title: "Quote",
    active: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    icon: "code",
    title: "Code (Ctrl+E)",
    active: (e) => e.isActive("code") || e.isActive("codeBlock"),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    id: "highlight",
    icon: "highlighter",
    title: "Highlight",
    active: (e) => e.isActive("highlight"),
    run: (e) => e.chain().focus().toggleMark("highlight").run(),
  },
];

const label = (title: string) => title.replace(/ \(.*\)$/, "");

/** The formatting bar over a note: marks and blocks, a link, a text colour, and whether it is saved. */
export function Toolbar({
  editor,
  status,
  linking,
  setLinking,
}: {
  editor: Editor;
  status: string;
  linking: boolean;
  setLinking(on: boolean): void;
}) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }): Record<string, boolean> => ({
      ...Object.fromEntries(TOOLS.map((t) => [t.id, t.active(e)])),
      link: e.isActive("link"),
    }),
  });
  const [colors, setColors] = useState(false);
  const [url, setUrl] = useState("");
  const keep = (e: { preventDefault(): void }) => e.preventDefault();

  const openLink = () => {
    if (active.link) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    setUrl("");
    setLinking(true);
  };
  const addLink = () => {
    const href = url.trim();
    if (!isSafeUrl(href)) return;
    const chain = editor.chain().focus();
    if (editor.state.selection.empty)
      chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] });
    else chain.extendMarkRange("link").setLink({ href });
    chain.run();
    setLinking(false);
  };
  const paint = (color: TextColor | undefined) => {
    setColors(false);
    const chain = editor.chain().focus();
    (color ? chain.setMark("textColor", { color }) : chain.unsetMark("textColor")).run();
  };

  return (
    <div className="nb-toolbar" role="toolbar" aria-label="Formatting">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="btn"
          title={t.title}
          aria-label={label(t.title)}
          aria-pressed={active[t.id] === true}
          onMouseDown={keep}
          onClick={() => t.run(editor)}
        >
          <Icon name={t.icon} size={14} />
        </button>
      ))}
      <button
        type="button"
        className="btn"
        title="Link (Ctrl+K)"
        aria-label="Link"
        aria-pressed={active.link === true}
        onMouseDown={keep}
        onClick={openLink}
      >
        <Icon name="link" size={14} />
      </button>
      <button
        type="button"
        className="btn"
        title="Text colour"
        aria-label="Text colour"
        aria-expanded={colors}
        onMouseDown={keep}
        onClick={() => setColors(!colors)}
      >
        <Icon name="palette" size={14} />
      </button>
      {colors && (
        <fieldset className="md-colors" aria-label="Colours">
          {(Object.keys(TEXT_COLORS) as TextColor[]).map((c) => (
            <button
              key={c}
              type="button"
              className="md-swatch"
              title={c}
              aria-label={c}
              style={{ background: `var(--${TEXT_COLORS[c]})` }}
              onMouseDown={keep}
              onClick={() => paint(c)}
            />
          ))}
          <button
            type="button"
            className="btn nb-uncolor"
            onMouseDown={keep}
            onClick={() => paint(undefined)}
          >
            No colour
          </button>
        </fieldset>
      )}
      {linking && (
        <form
          className="nb-link"
          onSubmit={(e) => {
            e.preventDefault();
            addLink();
          }}
        >
          <input
            className="input"
            aria-label="Link address"
            placeholder="https://…"
            // biome-ignore lint/a11y/noAutofocus: it opens because the owner asked for a link
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLinking(false);
                editor.commands.focus();
              }
            }}
          />
          <button type="submit" className="btn" disabled={!isSafeUrl(url.trim())}>
            Add
          </button>
        </form>
      )}
      <span className="muted md-state" role="status">
        {status}
      </span>
    </div>
  );
}
