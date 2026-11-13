import { NOTES, normFolder } from "../../../shared/notes.ts";
import { COLOR_FIELD } from "../../../shared/pages.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useSaver } from "../app/hooks.ts";
import { navigate } from "../app/router.ts";
import { NoteBody } from "../editor/NoteBody.tsx";
import { notePath } from "../logic/notes.ts";
import { titleOf } from "../logic/views.ts";
import { Icon } from "./icon.tsx";
import { createNote } from "./NoteForm.tsx";

const when = (iso: unknown) =>
  typeof iso === "string" && iso
    ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "";

/**
 * One note open as a page (M15): a slim bar (back, topic, colour, delete), the title, then the
 * text in one pane. A `[[link]]` to a note that doesn't exist yet creates it in this topic.
 * Delete is soft: the note stays in the history.
 */
export function NoteEditor({
  note,
  backHref,
  resolve,
  onDeleted,
}: {
  note: Doc;
  backHref: string;
  resolve(title: string): { href: string } | undefined;
  onDeleted(): void;
}) {
  const { local } = useCave();
  const saver = useSaver(NOTES);
  const body = typeof note.data._body === "string" ? note.data._body : "";
  const topic = normFolder(note.data.folder);
  const remove = () => {
    if (confirm(`Delete “${titleOf(note)}”? It stays in the history and can be restored.`))
      void saver.save(note.id, { _deleted: true }).then((ok) => ok && onDeleted());
  };
  const createLinked = async (title: string) =>
    navigate(notePath(await createNote(local, title, topic)));

  return (
    <article className="note-page" aria-label={`Note ${titleOf(note)}`}>
      <div className="note-bar">
        <a className="btn" href={backHref} aria-label="Back to notes">
          <Icon name="chevron-left" size={15} />
        </a>
        <input
          className="input note-topic"
          aria-label="Topic"
          placeholder="Topic"
          defaultValue={topic}
          onBlur={(e) => {
            const next = normFolder(e.target.value);
            if (next !== topic) void saver.save(note.id, { folder: next });
          }}
        />
        <select
          className="input"
          aria-label="Colour"
          value={typeof note.data.color === "string" ? note.data.color : ""}
          onChange={(e) => void saver.save(note.id, { color: e.target.value || null })}
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
      <input
        className="note-title"
        aria-label="Note title"
        placeholder="Untitled"
        defaultValue={titleOf(note)}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next && next !== titleOf(note)) void saver.save(note.id, { _title: next });
        }}
      />
      {note.data.source === "agent" && (
        <span className="muted note-by">
          Written by an agent
          {typeof note.data._created === "string" ? ` · ${when(note.data._created)}` : ""}
        </span>
      )}
      <NoteBody
        id={`note-${note.id}`}
        label="Note body"
        value={body}
        placeholder="Write, or type / for a heading, a checklist, a diagram…"
        resolve={resolve}
        onMissing={(title) => void createLinked(title)}
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
