import { useState } from "react";
import { INBOX, NOTES } from "../../../shared/notes.ts";
import { colorToken } from "../../../shared/pages.ts";
import { isLive } from "../../../shared/project-status.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { navigate, projectPath } from "../app/router.ts";
import { pagePath, wikiResolver } from "../logic/notes.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { Icon } from "./icon.tsx";
import { NoteEditor, when } from "./NoteEditor.tsx";
import { createNote } from "./NoteForm.tsx";

/**
 * A project's Pages tab (M12 part 6): its notes as a list (title, colour, when, who), New
 * page, and one page open in the note editor. Wikilinks resolve to the project's own pages first.
 */
export function Pages({ project, noteId }: { project: Doc; noteId: string | undefined }) {
  const { local } = useCave();
  const all = useItems(local.db, NOTES);
  const projects = useItems(local.db, "projects");
  const [message, setMessage] = useState<string>();
  if (!all || !projects) return null;
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
      <NoteEditor
        key={open.id}
        note={open}
        kind="Page"
        backHref={projectPath(project.id, "pages")}
        resolve={wikiResolver(notes, all.filter(isLive), projects)}
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
