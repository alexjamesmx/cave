import { NOTES, normFolder } from "../../../shared/notes.ts";
import { COLOR_FIELD } from "../../../shared/pages.ts";
import type { Doc } from "../../../shared/types.ts";
import { useSaver } from "../app/hooks.ts";
import { titleOf } from "../logic/views.ts";
import { Icon } from "./icon.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";

export const when = (iso: unknown) =>
  typeof iso === "string" && iso
    ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "";

/**
 * One note open in the Markdown editor, for a project's page and the Notes section alike:
 * Rename, Colour, Topic (Notes only), Delete (soft: it stays in the history).
 */
export function NoteEditor({
  note,
  kind,
  backHref,
  resolve,
  onDeleted,
}: {
  note: Doc;
  /** "Page" inside a project, "Note" in the Notes section; it names the controls. */
  kind: "Page" | "Note";
  backHref: string;
  resolve(title: string): { href: string } | undefined;
  onDeleted(): void;
}) {
  const saver = useSaver(NOTES);
  const body = typeof note.data._body === "string" ? note.data._body : "";
  const remove = () => {
    if (confirm(`Delete “${titleOf(note)}”? It stays in the history and can be restored.`))
      void saver.save(note.id, { _deleted: true }).then((ok) => ok && onDeleted());
  };
  return (
    <article
      className="panel"
      aria-label={`${kind} ${titleOf(note)}`}
      style={{ padding: 16, display: "grid", gap: 12 }}
    >
      <div className="page-head">
        <a className="btn" href={backHref} aria-label={`All ${kind.toLowerCase()}s`}>
          <Icon name="chevron-left" size={15} />
        </a>
        <input
          className="input title-input"
          aria-label={`${kind} title`}
          defaultValue={titleOf(note)}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== titleOf(note)) void saver.save(note.id, { _title: next });
          }}
        />
        {kind === "Note" && (
          <input
            className="input"
            aria-label="Topic"
            placeholder="Topic"
            defaultValue={normFolder(note.data.folder)}
            onBlur={(e) => {
              const next = normFolder(e.target.value);
              if (next !== normFolder(note.data.folder)) void saver.save(note.id, { folder: next });
            }}
            style={{ width: 180 }}
          />
        )}
        <select
          className="input"
          aria-label="Colour"
          value={typeof note.data.color === "string" ? note.data.color : ""}
          onChange={(e) => void saver.save(note.id, { color: e.target.value || null })}
          style={{ width: "auto" }}
        >
          <option value="">No colour</option>
          {COLOR_FIELD.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={remove}>
          <Icon name="trash" size={14} /> Delete
        </button>
      </div>
      {note.data.source === "agent" && (
        <span className="muted" style={{ fontSize: 13 }}>
          Written by an agent
          {typeof note.data._created === "string" ? ` · ${when(note.data._created)}` : ""}
        </span>
      )}
      <MarkdownEditor
        id={`note-${note.id}`}
        label={`${kind} body`}
        value={body}
        placeholder={`Write in Markdown. [[Title]] links another ${kind.toLowerCase()}; a mermaid code block draws a diagram.`}
        resolve={resolve}
        onSave={(text) => void saver.save(note.id, { _body: text })}
      />
      {saver.error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {saver.error}
        </p>
      )}
    </article>
  );
}
