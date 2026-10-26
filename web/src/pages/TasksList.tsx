import { useMemo, useState } from "react";
import { useCave } from "../app/context.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import {
  TASK_CHIPS,
  type TaskChip,
  taskList,
  taskQueryFromSearch,
  taskQueryToSearch,
} from "../logic/task-list.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { rowOpen } from "../ui/row-open.ts";
import { NewItem } from "../views/NewItem.tsx";

const CHIP_LABEL: Record<TaskChip, string> = {
  open: "Open",
  done: "Done",
  dropped: "Dropped",
  all: "All",
};

/**
 * Tasks → List (M13): chips Open (default), Done, Dropped and All with their counts, search,
 * open tasks by due date; a row opens the task. The query lives in the address.
 */
export function TasksList() {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, "tasks");
  const search = useSearch();
  const q = useMemo(() => taskQueryFromSearch(search), [search]);
  const [open, setOpen] = useState<string>();
  const list = useMemo(() => taskList(items ?? [], q.chip, q.text), [items, q]);
  const stored = collections?.find((c) => c.id === "tasks");
  if (!stored || !items) return null;
  const collection = withActiveFields(stored);
  const field = (id: string) => collection.data.fields.find((f) => f.id === id);
  const [status, due, priority, project] = ["status", "due", "priority", "project"].map(field);
  const set = (patch: Partial<typeof q>) => setSearch(taskQueryToSearch({ ...q, ...patch }));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="ledger-controls">
        <fieldset className="chips">
          <legend className="sr">Show</legend>
          {TASK_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="btn"
              aria-pressed={q.chip === c}
              onClick={() => set({ chip: c })}
            >
              {CHIP_LABEL[c]} <span className="num muted">{list.counts[c]}</span>
            </button>
          ))}
        </fieldset>
        <input
          className="input"
          type="search"
          aria-label="Search tasks"
          placeholder="Search"
          value={q.text}
          onChange={(e) => set({ text: e.target.value })}
          style={{ flex: "1 1 140px", minWidth: 0 }}
        />
      </div>
      <NewItem collection="tasks" preset={{ status: "todo" }} placeholder="New task" />
      <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
        <table className="table" aria-label="Tasks">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Due</th>
              <th>Priority</th>
              {project && <th>Project</th>}
            </tr>
          </thead>
          <tbody>
            {list.rows.map((d) => (
              <tr key={d.id} {...rowOpen(() => setOpen(d.id))}>
                <td>
                  <button type="button" className="link" onClick={() => setOpen(d.id)}>
                    {titleOf(d)}
                  </button>
                </td>
                <td>{status && <OptionChip field={status} value={d.data.status} />}</td>
                <td>{due && <FieldValue field={due} value={d.data.due} />}</td>
                <td>{priority && <FieldValue field={priority} value={d.data.priority} />}</td>
                {project && (
                  <td>
                    <FieldValue field={project} value={d.data.project} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: 12 }}>
          <span className="num muted" style={{ fontSize: 12 }}>
            {list.rows.length === 0 ? "Nothing here." : `${list.rows.length} tasks`}
          </span>
        </div>
      </section>
      {open && (
        <ItemDrawer
          key={open}
          collection={collection}
          id={open}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}
