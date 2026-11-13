import type { Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { noteExtensions } from "./extensions.ts";
import { looksLikeMarkdown, noteMarkdown, parseNote } from "./markdown.ts";
import { type SlashKeys, SlashMenu } from "./SlashMenu.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { CodeBlockWithDiagram, type Links, LinksContext, WikilinkWithView } from "./views.tsx";

const IDLE_MS = 2000;

type State = "saved" | "editing" | "conflict";

/**
 * A note's text in one pane, formatted as it is written (M15): Markdown shortcuts, the `/`
 * menu, checkboxes ticked with a click, wikilinks that open. `value` is the stored Markdown and
 * only an edit writes it back, so opening a note never rewrites it. Saved on blur and after two
 * seconds idle; when `value` changes under an unsaved edit (an agent, another device), the
 * editor asks before anything is written over.
 */
export function NoteBody({
  id,
  label,
  value,
  onSave,
  placeholder,
  resolve,
  onMissing,
}: {
  id: string;
  label: string;
  value: string;
  onSave(text: string): void;
  placeholder?: string;
} & Links) {
  const [state, setState] = useState<State>("saved");
  const [linking, setLinking] = useState(false);
  // `loaded` is the stored text; `shown` is how the editor writes that same text, so an edit is
  // told apart from Tiptap tidying what it loaded (`_a_` read back as `*a*`, a trailing line
  // after a table): only a difference from `shown` is the owner's.
  const live = useRef({ state, loaded: value, shown: noteMarkdown(parseNote(value)), onSave });
  live.current.state = state;
  live.current.onSave = onSave;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const slash = useRef<SlashKeys>(undefined);
  const editorRef = useRef<Editor | null>(null);

  const mark = (next: State) => {
    live.current.state = next;
    setState(next);
  };
  const write = (text: string) => {
    if (text !== live.current.shown) {
      live.current.onSave(text);
      live.current.loaded = text;
      live.current.shown = text;
    }
    mark("saved");
  };
  const save = () => {
    clearTimeout(timer.current);
    const e = editorRef.current;
    if (e && live.current.state === "editing") write(noteMarkdown(e.getJSON()));
  };
  const load = (text: string) => {
    const doc = parseNote(text);
    editorRef.current?.commands.setContent(doc, { emitUpdate: false });
    live.current.loaded = text;
    live.current.shown = noteMarkdown(doc);
    mark("saved");
  };

  const editor = useEditor(
    {
      extensions: [
        ...noteExtensions({ codeBlock: CodeBlockWithDiagram, wikilink: WikilinkWithView }),
        Placeholder.configure({ placeholder: placeholder ?? "" }),
      ],
      content: parseNote(value),
      // Its own <style> tag would break the CSP (style-src 'self'): editor.css has those rules.
      injectCSS: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          id,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": label,
          class: "nb-content markdown",
        },
        handleKeyDown: (_view, event) => {
          if (slash.current?.onKey(event.key)) return true;
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            setLinking(true);
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const text = event.clipboardData?.getData("text/plain") ?? "";
          if (event.clipboardData?.getData("text/html") || !looksLikeMarkdown(text)) return false;
          editorRef.current?.commands.insertContent(parseNote(text).content ?? []);
          return true;
        },
      },
      onUpdate: () => {
        if (live.current.state !== "conflict") mark("editing");
        clearTimeout(timer.current);
        timer.current = setTimeout(save, IDLE_MS);
      },
      onBlur: save,
    },
    [],
  );
  editorRef.current = editor;

  // A new stored value: taken when nothing is pending, else kept apart until the owner picks.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new stored value matters
  useEffect(() => {
    const e = editorRef.current;
    if (!e || value === live.current.loaded) return;
    const mine = noteMarkdown(e.getJSON());
    if (live.current.state === "saved" || mine === noteMarkdown(parseNote(value))) load(value);
    else mark("conflict");
  }, [value]);

  // Leaving the note (another page, a shortcut) saves what was typed since the last save.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on unmount
  useEffect(() => () => save(), []);

  if (!editor) return null;
  return (
    <div className="nb">
      <Toolbar
        editor={editor}
        status={state === "saved" ? "Saved" : state === "editing" ? "Editing…" : ""}
        linking={linking}
        setLinking={setLinking}
      />
      {state === "conflict" && (
        <div className="banner" role="alert">
          <span>Changed elsewhere while you were editing.</span>
          <button type="button" className="btn" onClick={() => load(value)}>
            Reload
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              // Written even if it matches what was loaded: the stored value is the other one.
              live.current.shown = "";
              write(noteMarkdown(editor.getJSON()));
            }}
          >
            Keep mine
          </button>
        </div>
      )}
      <LinksContext.Provider
        value={{ ...(resolve ? { resolve } : {}), ...(onMissing ? { onMissing } : {}) }}
      >
        <EditorContent editor={editor} />
      </LinksContext.Provider>
      <SlashMenu editor={editor} keys={slash} />
    </div>
  );
}
