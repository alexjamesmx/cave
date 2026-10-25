import { useState } from "react";
import { NOTES } from "../../../shared/notes.ts";
import { useCave } from "../app/context.ts";
import { projectPath } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { ItemDrawer } from "./ItemDrawer.tsx";
import { rowOpen } from "./row-open.ts";

const SHOWN = 20;

/**
 * Notes without a view of their own (M12 part 5, until pages arrive in part 6): every live
 * note, newest first, with its project when it has one and who wrote it. Opening one shows
 * its Markdown in the drawer.
 */
export function NotesInbox() {
  const { db } = useCave().local;
  const notes = useItems(db, NOTES);
  const projects = useItems(db, "projects");
  const collection = useCollections(db)?.find((c) => c.id === NOTES);
  const [open, setOpen] = useState<string>();
  const [all, setAll] = useState(false);
  if (!notes || !collection) return null;
  const live = notes
    .filter((n) => n.data._deleted !== true)
    .sort((a, b) => String(b.data._created ?? "").localeCompare(String(a.data._created ?? "")));
  if (live.length === 0) return null;
  const projectTitle = (id: unknown) => {
    const p = projects?.find((x) => x.id === id);
    return p ? titleOf(p) : undefined;
  };
  return (
    <section className="panel" aria-label="Notes" style={{ padding: 16, display: "grid", gap: 6 }}>
      <span className="k">Notes · {live.length}</span>
      <ul className="agenda-list" aria-label="Note list">
        {(all ? live : live.slice(0, SHOWN)).map((n) => (
          <li key={n.id} className="agenda-row" {...rowOpen(() => setOpen(n.id))}>
            <button type="button" className="link" onClick={() => setOpen(n.id)}>
              {titleOf(n)}
            </button>
            {projectTitle(n.data.project) && (
              <a className="chip" href={projectPath(String(n.data.project))}>
                {projectTitle(n.data.project)}
              </a>
            )}
            {n.data.source === "agent" && <span className="muted">by agent</span>}
          </li>
        ))}
      </ul>
      {live.length > SHOWN && !all && (
        <button type="button" className="link" onClick={() => setAll(true)}>
          Show all {live.length}
        </button>
      )}
      {open && (
        <ItemDrawer
          key={open}
          collection={withActiveFields(collection)}
          id={open}
          onClose={() => setOpen(undefined)}
        />
      )}
    </section>
  );
}
