import { useState } from "react";
import { INBOX, NOTES } from "../../../shared/notes.ts";
import { COLOR_FIELD, colorToken } from "../../../shared/pages.ts";
import { isLive } from "../../../shared/project-status.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useSaver } from "../app/hooks.ts";
import { navigate, projectPath } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { Icon } from "./icon.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";
import { createNote } from "./NoteForm.tsx";

const when = (iso: unknown) =>
  typeof iso === "string" && iso
    ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "";

/** The path of one page of a project. */
export const pagePath = (project: string, note: string) =>
  `${projectPath(project, "pages")}/${encodeURIComponent(note)}`;

/**
 * A project's Pages tab (M12 part 6): its notes as a list (title, colour, when, who), New
 * page, and one page open in the Markdown editor with Rename, Colour and Delete (soft: it
 * stays in the history). Wikilinks resolve to the project's own pages first.
 */
export function Pages({ project, noteId }: { project: Doc; noteId: string | undefined }) {
  const { local } = useCave();
  const all = useItems(local.db, NOTES);
  const [message, setMessage] = useState<string>();
  if (!all) return null;
  const notes = all.filter((n) => n.data.project === project.id && isLive(n));
  const open = noteId ? notes.find((n) => n.id === noteId) : undefined;

  const create = async () => {
    const id = await createNote(local, "Untitled page", INBOX, project.id);
    navigate(pagePath(project.id, id));
  };

  if (noteId && !open)
    return (
      <p className="muted">
        No page “{noteId}” on this project. <a href={projectPath(project.id, "pages")}>Pages</a>
      </p>
    );
  if (open)
    return (
      <Page
        note={open}
        project={project}
        siblings={notes}
        everyNote={all.filter(isLive)}
        onDeleted={() => {
          setMessage(`Deleted · ${titleOf(open)}`);
          navigate(projectPath(project.id, "pages"));
        }}
      />
    );
  const sorted = [...notes].sort((a, b) =>
    String(b.data._created ?? "").localeCompare(String(a.data._created ?? "")),
  );
  return (
    <section className="panel" aria-label="Pages" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="k" style={{ flex: 1 }}>
          Pages · {sorted.length}
        </span>
        <button type="button" className="btn primary" onClick={() => void create()}>
          <Icon name="plus" size={15} /> New page
        </button>
      </div>
      {message && (
        <p role="status" className="muted" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      {sorted.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No pages yet. Resources, the plan, lists: anything long lives here.
        </p>
      )}
      <ul className="page-list">
        {sorted.map((n) => (
          <li key={n.id}>
            <a className="page-row" href={pagePath(project.id, n.id)}>
              <span
                className="page-dot"
                style={{ background: colorToken(n.data.color) ?? "var(--line)" }}
              />
              <span style={{ flex: 1 }}>{titleOf(n)}</span>
              {n.data.source === "agent" && <span className="muted">by agent</span>}
              <span className="num muted" style={{ fontSize: 12 }}>
                {when(n.data._created)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Page({
  note,
  project,
  siblings,
  everyNote,
  onDeleted,
}: {
  note: Doc;
  project: Doc;
  siblings: Doc[];
  everyNote: Doc[];
  onDeleted(): void;
}) {
  const saver = useSaver(NOTES);
  const body = typeof note.data._body === "string" ? note.data._body : "";
  const byTitle = (title: string) => {
    const key = title.toLowerCase();
    return (
      siblings.find((n) => titleOf(n).toLowerCase() === key) ??
      everyNote.find((n) => titleOf(n).toLowerCase() === key)
    );
  };
  const resolve = (title: string) => {
    const hit = byTitle(title);
    if (!hit) return undefined;
    const owner = typeof hit.data.project === "string" ? hit.data.project : undefined;
    return { href: owner ? pagePath(owner, hit.id) : "/projects/all" };
  };
  const remove = () => {
    if (confirm(`Delete “${titleOf(note)}”? It stays in the history and can be restored.`))
      void saver.save(note.id, { _deleted: true }).then((ok) => ok && onDeleted());
  };
  return (
    <article
      className="panel"
      aria-label={`Page ${titleOf(note)}`}
      style={{ padding: 16, display: "grid", gap: 12 }}
    >
      <div className="page-head">
        <a className="btn" href={projectPath(project.id, "pages")} aria-label="All pages">
          <Icon name="chevron-left" size={15} />
        </a>
        <input
          className="input title-input"
          aria-label="Page title"
          defaultValue={titleOf(note)}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== titleOf(note)) void saver.save(note.id, { _title: next });
          }}
        />
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
        id={`page-${note.id}`}
        label="Page body"
        value={body}
        placeholder="Write in Markdown. [[Title]] links another page."
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
