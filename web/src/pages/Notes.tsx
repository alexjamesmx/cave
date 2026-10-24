import { type FormEvent, useMemo, useState } from "react";
import { newId } from "../../../shared/ids.ts";
import { INBOX, NOTES, normFolder } from "../../../shared/notes.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { navigate, setSearch, useSearch } from "../app/router.ts";
import {
  type FolderNode,
  folderTree,
  inFolder,
  links,
  noteByTitle,
  searchNotes,
} from "../logic/notes.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { FieldInput, OptionChip } from "../ui/fields.tsx";
import { Icon } from "../ui/icon.tsx";
import { MarkdownView } from "../ui/Markdown.tsx";
import { projectFilterOf } from "../ui/ProjectFilter.tsx";
import { rowOpen } from "../ui/row-open.ts";

const notePath = (id: string, project?: string) =>
  project
    ? `/projects/notes?project=${encodeURIComponent(project)}&note=${encodeURIComponent(id)}`
    : `/projects/notes/${encodeURIComponent(id)}`;

/** Creates a note and returns its id; `folder` and `project` place it. */
async function createNote(
  local: ReturnType<typeof useCave>["local"],
  title: string,
  folder: string,
  project?: string,
): Promise<string> {
  const id = newId();
  await local.write(
    { id, kind: "item", collection: NOTES },
    {
      _title: title,
      folder: normFolder(folder),
      source: "owner",
      ...(project ? { project } : {}),
    },
  );
  return id;
}

/**
 * Projects → Notes (scoped to one project with `?project=`): a folder tree and search on the
 * left, the open note on the right, rendered, with its links and backlinks. Works offline.
 */
export function NotesPage({ noteId }: { noteId?: string }) {
  const { local } = useCave();
  const all = useItems(local.db, NOTES);
  const search = useSearch();
  // `?project=` scopes the page to one project (the project page links here).
  const project = projectFilterOf(search);
  const params = new URLSearchParams(search);
  const query = params.get("q") ?? "";
  const folder = params.get("folder") ?? "";
  const openId = noteId ?? params.get("note") ?? undefined;
  const notes = useMemo(
    () => (all ?? []).filter((n) => !project || n.data.project === project),
    [all, project],
  );
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    setSearch(s ? `?${s}` : "");
  };
  const open = (id: string) => {
    if (project) setParam("note", id);
    else navigate(`${notePath(id)}${search}`);
  };
  const [title, setTitle] = useState("");

  if (!all) return null;
  const tree = folderTree(notes);
  const hits = query ? searchNotes(notes, query) : [];
  const listed = query
    ? hits.map((h) => h.doc)
    : inFolder(notes, folder).sort((a, b) => (titleOf(a) < titleOf(b) ? -1 : 1));
  const current = openId ? notes.find((n) => n.id === openId) : undefined;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const id = await createNote(local, title.trim(), folder || INBOX, project);
    setTitle("");
    open(id);
  };

  const branch = (nodes: FolderNode[], depth: number) =>
    nodes.map((n) => (
      <li key={n.path} style={{ listStyle: "none" }}>
        <button
          type="button"
          className={`folder${folder === n.path ? " active" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          aria-current={folder === n.path ? "true" : undefined}
          onClick={() => setParam("folder", folder === n.path ? "" : n.path)}
        >
          <Icon name={n.path === INBOX ? "inbox" : "folder"} size={14} />
          <span style={{ flex: 1, textAlign: "left" }}>{n.name}</span>
          <span className="num muted">{n.count}</span>
        </button>
        {n.children.length > 0 && (
          <ul style={{ margin: 0, padding: 0 }}>{branch(n.children, depth + 1)}</ul>
        )}
      </li>
    ));

  return (
    <div className="notes">
      <aside className="panel notes-side" aria-label="Notes">
        <input
          className="input"
          type="search"
          aria-label="Search notes"
          placeholder="Search notes"
          value={query}
          onChange={(e) => setParam("q", e.target.value)}
        />
        <form onSubmit={(e) => void add(e)} style={{ display: "flex", gap: 6 }}>
          <input
            className="input"
            aria-label="New note"
            placeholder={`New note in ${folder || INBOX}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="submit" className="btn">
            Add
          </button>
        </form>
        {!query && (
          <ul aria-label="Folders" style={{ margin: 0, padding: 0 }}>
            <li style={{ listStyle: "none" }}>
              <button
                type="button"
                className={`folder${folder === "" ? " active" : ""}`}
                onClick={() => setParam("folder", "")}
              >
                <Icon name="library" size={14} />
                <span style={{ flex: 1, textAlign: "left" }}>All notes</span>
                <span className="num muted">
                  {notes.filter((n) => n.data._deleted !== true).length}
                </span>
              </button>
            </li>
            {branch(tree, 0)}
          </ul>
        )}
        <ul aria-label={query ? "Search results" : "Notes in folder"} className="note-list">
          {listed.length === 0 && (
            <li className="muted">{query ? "Nothing found." : "No notes here."}</li>
          )}
          {listed.map((n) => {
            const hit = hits.find((h) => h.doc.id === n.id);
            return (
              <li
                key={n.id}
                className={`note-row${n.id === current?.id ? " active" : ""}`}
                {...rowOpen(() => open(n.id))}
              >
                <strong>{titleOf(n)}</strong>
                {hit?.snippet && <span className="muted note-snippet">{hit.snippet}</span>}
              </li>
            );
          })}
        </ul>
      </aside>
      {current ? (
        <NoteView key={current.id} note={current} notes={all} project={project} onOpen={open} />
      ) : (
        <section className="panel notes-main muted">Pick a note, or add one.</section>
      )}
    </div>
  );
}

function NoteView({
  note,
  notes,
  project,
  onOpen,
}: {
  note: Doc;
  notes: Doc[];
  project: string | undefined;
  onOpen(id: string): void;
}) {
  const { local } = useCave();
  const collections = useCollections(local.db);
  const fields = collections?.find((c) => c.id === NOTES)?.data.fields ?? [];
  const [editing, setEditing] = useState(false);
  const save = (patch: Record<string, unknown>) =>
    void local.write({ id: note.id, kind: "item", collection: NOTES }, patch);
  const body = typeof note.data._body === "string" ? note.data._body : "";
  const { outgoing, backlinks } = links(notes, note);
  const field = (id: string) => fields.find((f) => f.id === id);
  const source = field("source");
  const url = field("url");
  const ref = field("project");
  const currentFolder = normFolder(note.data.folder);
  const missing = async (title: string) => {
    if (!confirm(`Create the note “${title}” in ${currentFolder || "the root"}?`)) return;
    onOpen(await createNote(local, title, currentFolder, project));
  };

  return (
    <article className="panel notes-main" aria-label={`Note ${String(note.data._title ?? "")}`}>
      <input
        key={`t-${String(note.data._title)}`}
        className="input title-input"
        aria-label="Title"
        defaultValue={typeof note.data._title === "string" ? note.data._title : ""}
        onBlur={(e) => {
          if (e.target.value.trim() && e.target.value !== note.data._title)
            save({ _title: e.target.value.trim() });
        }}
      />
      <div className="note-meta">
        <label>
          <span className="k">Folder</span>
          <input
            key={`f-${currentFolder}`}
            className="input"
            aria-label="Folder"
            defaultValue={currentFolder}
            placeholder="root"
            onBlur={(e) => {
              const next = normFolder(e.target.value);
              if (next !== currentFolder) save({ folder: next });
            }}
          />
        </label>
        {url && (
          <div className="note-field">
            <label className="k" htmlFor="note-url">
              URL
            </label>
            <FieldInput
              id="note-url"
              field={url}
              value={note.data.url}
              onChange={(v) => save({ url: v })}
            />
          </div>
        )}
        {ref && (
          <div className="note-field">
            <label className="k" htmlFor="note-project">
              Project
            </label>
            <FieldInput
              id="note-project"
              field={ref}
              value={note.data.project}
              onChange={(v) => save({ project: v })}
            />
          </div>
        )}
        {source && <OptionChip field={source} value={note.data.source} />}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          <Icon name={editing ? "eye" : "pencil"} size={14} /> {editing ? "Done" : "Edit"}
        </button>
        <button
          type="button"
          className="btn"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            if (confirm(`Delete “${titleOf(note)}”? It stays in the history and can be restored.`))
              save({ _deleted: true });
          }}
        >
          <Icon name="trash" size={14} /> Delete
        </button>
      </div>
      {editing ? (
        <textarea
          key={`b-${body}`}
          className="input note-editor"
          aria-label="Note text"
          defaultValue={body}
          rows={18}
          onBlur={(e) => {
            if (e.target.value !== body) save({ _body: e.target.value });
          }}
        />
      ) : body.trim() ? (
        <MarkdownView
          text={body}
          resolve={(t) => {
            const target = noteByTitle(notes, t);
            return target ? { href: notePath(target.id, project) } : undefined;
          }}
          onMissing={(t) => void missing(t)}
        />
      ) : (
        <p className="muted">Empty. Press Edit to write.</p>
      )}
      <div className="split">
        <section aria-label="Links" style={{ display: "grid", gap: 4 }}>
          <span className="k">Links</span>
          {outgoing.length === 0 && <span className="muted">None.</span>}
          {outgoing.map((o) =>
            o.doc ? (
              <a key={o.title} className="link" href={notePath(o.doc.id, project)}>
                {titleOf(o.doc)}
              </a>
            ) : (
              <span key={o.title} className="muted">
                {o.title} (no note yet)
              </span>
            ),
          )}
        </section>
        <section aria-label="Linked from" style={{ display: "grid", gap: 4 }}>
          <span className="k">Linked from</span>
          {backlinks.length === 0 && <span className="muted">Nothing links here yet.</span>}
          {backlinks.map((b) => (
            <a key={b.id} className="link" href={notePath(b.id, project)}>
              {titleOf(b)}
            </a>
          ))}
        </section>
      </div>
    </article>
  );
}

/** Home's quick note: a title and some text into the Inbox, then the note opens. */
export function NoteForm({ onDone }: { onDone(message: string): void }) {
  const { local } = useCave();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const id = await createNote(local, title.trim(), INBOX);
    if (text.trim())
      await local.write({ id, kind: "item", collection: NOTES }, { _body: text.trim() });
    onDone(`Saved · Note · ${title.trim()}`);
    navigate(notePath(id));
  };
  return (
    <form className="panel quick-form" aria-label="Note" onSubmit={(e) => void submit(e)}>
      <label className="quick-field">
        <span className="k">Title</span>
        <input
          className="input"
          required
          // biome-ignore lint/a11y/noAutofocus: the N shortcut opens this form to type
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="quick-field">
        <span className="k">Text</span>
        <textarea
          className="input"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        Save to Inbox
      </button>
    </form>
  );
}
