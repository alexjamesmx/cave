import { useState } from "react";
import { NOTES } from "../../../shared/notes.ts";
import { colorToken } from "../../../shared/pages.ts";
import { isLive } from "../../../shared/project-status.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { navigate, useSearch } from "../app/router.ts";
import {
  excerpt,
  groupByTopic,
  looseNotes,
  matchesNote,
  notePath,
  wikiResolver,
} from "../logic/notes.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";
import { NoteEditor, when } from "../ui/NoteEditor.tsx";
import { createNote } from "../ui/NoteForm.tsx";
import { rowOpen } from "../ui/row-open.ts";

const ALL = "/notes/all";

/**
 * Notes → Notes: everything written that is not a project's page, grouped by topic, as a
 * gallery or a table (`?view=table`), with search and New note. `/notes/all/<id>` opens one.
 */
export function Notes({ id }: { id: string | undefined }) {
  const { local } = useCave();
  const all = useItems(local.db, NOTES);
  const projects = useItems(local.db, "projects");
  const table = new URLSearchParams(useSearch()).get("view") === "table";
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string>();
  if (!all || !projects) return null;
  const notes = looseNotes(all, projects);
  const open = id ? notes.find((n) => n.id === id) : undefined;

  if (id && !open)
    return (
      <p className="muted">
        No note “{id}”. <a href={ALL}>All notes</a>
      </p>
    );
  if (open)
    return (
      <NoteEditor
        key={open.id}
        note={open}
        kind="Note"
        backHref={ALL}
        resolve={wikiResolver(notes, all.filter(isLive), projects)}
        onDeleted={() => {
          setMessage(`Deleted · ${titleOf(open)}`);
          navigate(ALL);
        }}
      />
    );

  const create = async () => navigate(notePath(await createNote(local, "Untitled note", "")));
  const groups = groupByTopic(notes.filter((n) => matchesNote(n, query)));
  return (
    <section aria-label="Notes" style={{ display: "grid", gap: 14 }}>
      <div className="notes-bar">
        <input
          className="input"
          type="search"
          aria-label="Search notes"
          placeholder="Search notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav className="sub-tabs" aria-label="Notes view">
          <a href={ALL} aria-current={table ? undefined : "page"}>
            <Icon name="layout-grid" size={14} /> Gallery
          </a>
          <a href={`${ALL}?view=table`} aria-current={table ? "page" : undefined}>
            <Icon name="table" size={14} /> Table
          </a>
        </nav>
        <button type="button" className="btn primary" onClick={() => void create()}>
          <Icon name="plus" size={15} /> New note
        </button>
      </div>
      {message && (
        <p role="status" className="muted" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      {notes.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No notes yet. Anything worth keeping: class notes, specs, links, ideas.
        </p>
      )}
      {notes.length > 0 && groups.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No note matches “{query}”.
        </p>
      )}
      {table ? (
        <NotesTable groups={groups} />
      ) : (
        groups.map((g) => (
          <section
            key={g.topic}
            aria-label={`Topic ${g.topic}`}
            style={{ display: "grid", gap: 8 }}
          >
            <h2 className="k notes-topic">
              {g.topic} <span className="num muted">{g.notes.length}</span>
            </h2>
            <div className="gallery">
              {g.notes.map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
            </div>
          </section>
        ))
      )}
    </section>
  );
}

function NoteCard({ note }: { note: Doc }) {
  const color = colorToken(note.data.color);
  return (
    <a
      className="panel card note-card"
      href={notePath(note.id)}
      style={color ? { borderLeftColor: color } : undefined}
    >
      <span className="note-card-title">{titleOf(note)}</span>
      <span className="muted note-card-text">{excerpt(note.data._body)}</span>
      <span className="num muted note-card-date">{when(note.data._created)}</span>
    </a>
  );
}

function NotesTable({ groups }: { groups: { topic: string; notes: Doc[] }[] }) {
  if (groups.length === 0) return null;
  return (
    <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
      <table className="table" aria-label="Notes table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Text</th>
            <th>Created</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.topic}>
            <tr className="notes-group-row">
              <th colSpan={3} scope="colgroup">
                {g.topic} <span className="num muted">{g.notes.length}</span>
              </th>
            </tr>
            {g.notes.map((n) => (
              <tr key={n.id} {...rowOpen(() => navigate(notePath(n.id)))}>
                <td>
                  <span
                    className="page-dot"
                    style={{
                      background: colorToken(n.data.color) ?? "var(--line)",
                      display: "inline-block",
                      marginRight: 8,
                    }}
                  />
                  <a href={notePath(n.id)}>{titleOf(n)}</a>
                </td>
                <td className="muted">{excerpt(n.data._body, 90)}</td>
                <td className="num muted">{when(n.data._created)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}
