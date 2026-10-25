import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type Action, apply, SHORTCUTS } from "../logic/markdown-edit.ts";
import { Icon } from "./icon.tsx";
import { MarkdownView } from "./Markdown.tsx";

const IDLE_MS = 2000;

const TOOLS: [Action, string, string][] = [
  ["heading", "heading-2", "Heading"],
  ["bold", "bold", "Bold (Ctrl+B)"],
  ["italic", "italic", "Italic (Ctrl+I)"],
  ["list", "list", "List"],
  ["checklist", "list-checks", "Checklist"],
  ["quote", "quote", "Quote"],
  ["code", "code", "Code (Ctrl+E)"],
  ["link", "link", "Link (Ctrl+K)"],
];

/**
 * The Markdown editor (M12 part 6): a textarea with a toolbar beside a live preview (an
 * Edit/Preview toggle on narrow screens), saved on blur and after two seconds idle. `value`
 * is what is stored: when it changes under an unsaved draft (an agent, another device), the
 * editor asks before anything is written over.
 */
export function MarkdownEditor({
  id,
  label,
  value,
  onSave,
  placeholder,
  resolve,
  onMissing,
  rows = 18,
}: {
  id: string;
  label: string;
  value: string;
  onSave(text: string): void;
  placeholder?: string;
  resolve?: (title: string) => { href: string } | undefined;
  onMissing?: (title: string) => void;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [loaded, setLoaded] = useState(value);
  const [state, setState] = useState<"saved" | "editing" | "conflict">("saved");
  const [preview, setPreview] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ draft, loaded, state });
  latest.current = { draft, loaded, state };

  // A new stored value: take it when nothing is pending, else keep the draft and say so.
  useEffect(() => {
    if (value === latest.current.loaded) return;
    if (latest.current.state === "saved" || latest.current.draft === value) {
      setDraft(value);
      setLoaded(value);
      setState("saved");
    } else setState("conflict");
  }, [value]);

  const save = () => {
    clearTimeout(timer.current);
    const { draft: text, loaded: was, state: s } = latest.current;
    if (s === "conflict" || text === was) return;
    onSave(text);
    setLoaded(text);
    setState("saved");
  };
  const change = (text: string) => {
    setDraft(text);
    if (latest.current.state !== "conflict") setState("editing");
    clearTimeout(timer.current);
    timer.current = setTimeout(save, IDLE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = (action: Action) => {
    const el = box.current;
    if (!el) return;
    const edit = apply(action, el.value, el.selectionStart, el.selectionEnd);
    change(edit.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(edit.start, edit.end);
    });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const action = SHORTCUTS[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    run(action);
  };

  return (
    <div className="md-editor" data-preview={preview ? "only" : "beside"}>
      <div className="md-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map(([action, icon, title]) => (
          <button
            key={action}
            type="button"
            className="btn"
            title={title}
            aria-label={title.replace(/ \(.*\)$/, "")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(action)}
          >
            <Icon name={icon} size={14} />
          </button>
        ))}
        <span className="muted md-state" role="status">
          {state === "saved" ? "Saved" : state === "editing" ? "Editing…" : ""}
        </span>
        <button
          type="button"
          className="btn md-toggle"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {state === "conflict" && (
        <div className="banner" role="alert">
          <span>Changed elsewhere while you were editing.</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft(value);
              setLoaded(value);
              setState("saved");
            }}
          >
            Reload
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onSave(latest.current.draft);
              setLoaded(latest.current.draft);
              setState("saved");
            }}
          >
            Keep mine
          </button>
        </div>
      )}
      <div className="md-panes">
        <textarea
          ref={box}
          id={id}
          className="input md-text"
          aria-label={label}
          rows={rows}
          value={draft}
          {...(placeholder ? { placeholder } : {})}
          onChange={(e) => change(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
        />
        <div className="md-preview">
          {draft.trim() ? (
            <MarkdownView
              text={draft}
              {...(resolve ? { resolve } : {})}
              {...(onMissing ? { onMissing } : {})}
            />
          ) : (
            <p className="muted">Nothing written yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
