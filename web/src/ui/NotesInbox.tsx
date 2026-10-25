import { useState } from "react";
import { normTitle } from "../../../shared/money-stats.ts";
import { NOTES } from "../../../shared/notes.ts";
import { isLive } from "../../../shared/project-status.ts";
import { useCave } from "../app/context.ts";
import { navigate } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { ItemDrawer } from "./ItemDrawer.tsx";
import { pagePath } from "./Pages.tsx";
import { rowOpen } from "./row-open.ts";

const SEARCH_FROM = 20;

/**
 * The Inbox (M12 part 6): notes that belong to no project, newest first, each with Move to
 * project, which makes it a page of that project. The Ask sheet's Note form and an agent's
 * `add_note` without a project land here. A search box appears past 20.
 */
export function NotesInbox() {
  const { local } = useCave();
  const notes = useItems(local.db, NOTES);
  const projects = useItems(local.db, "projects");
  const collection = useCollections(local.db)?.find((c) => c.id === NOTES);
  const [open, setOpen] = useState<string>();
  const [query, setQuery] = useState("");
  if (!notes || !collection) return null;
  const inbox = notes
    .filter((n) => isLive(n) && !n.data.project)
    .sort((a, b) => String(b.data._created ?? "").localeCompare(String(a.data._created ?? "")));
  if (inbox.length === 0) return null;
  const needle = normTitle(query);
  const shown = needle ? inbox.filter((n) => normTitle(titleOf(n)).includes(needle)) : inbox;
  const live = (projects ?? []).filter((p) => isLive(p) && p.data.status !== "dropped");
  const move = async (id: string, project: string) => {
    if (!project) return;
    await local.write({ id, kind: "item", collection: NOTES }, { project });
    navigate(pagePath(project, id));
  };
  return (
    <section className="panel" aria-label="Inbox" style={{ padding: 16, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="k" style={{ flex: 1 }}>
          Inbox · {inbox.length} note{inbox.length === 1 ? "" : "s"} on no project
        </span>
        {inbox.length > SEARCH_FROM && (
          <input
            className="input"
            type="search"
            aria-label="Search the inbox"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>
      <ul className="agenda-list" aria-label="Inbox notes">
        {shown.map((n) => (
          <li key={n.id} className="agenda-row" {...rowOpen(() => setOpen(n.id))}>
            <button type="button" className="link" onClick={() => setOpen(n.id)}>
              {titleOf(n)}
            </button>
            {n.data.source === "agent" && <span className="muted">by agent</span>}
            <select
              className="input"
              aria-label={`Move ${titleOf(n)} to project`}
              value=""
              onChange={(e) => void move(n.id, e.target.value)}
              style={{ width: "auto", marginLeft: "auto" }}
            >
              <option value="">Move to project…</option>
              {live.map((p) => (
                <option key={p.id} value={p.id}>
                  {titleOf(p)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
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
