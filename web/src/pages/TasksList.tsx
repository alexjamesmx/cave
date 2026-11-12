import { type CSSProperties, useMemo, useState } from "react";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { columnName, type DueTone, dueLabel } from "../logic/board.ts";
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
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { rowOpen } from "../ui/row-open.ts";
import { NewItem } from "../views/NewItem.tsx";

const CHIP_LABEL: Record<TaskChip, string> = {
  open: "Open",
  done: "Done",
  dropped: "Dropped",
  all: "All",
};

const TONE: Record<DueTone, string> = {
  bad: "var(--bad)",
  warn: "var(--warn)",
  plain: "#c3c8d1",
};

const pill = (color: string) => ({ "--c": color }) as CSSProperties;

/**
 * Tasks → List (M13): chips Open (default), Done, Dropped and All with their counts, search,
 * open tasks by due date; a row opens the task. The query lives in the address.
 */
export function TasksList() {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, "tasks");
  const today = useToday();
  const search = useSearch();
  const q = useMemo(() => taskQueryFromSearch(search), [search]);
  const [open, setOpen] = useState<string>();
  const list = useMemo(() => taskList(items ?? [], q.chip, q.text), [items, q]);
  const stored = collections?.find((c) => c.id === "tasks");
  if (!stored || !items) return null;
  const collection = withActiveFields(stored);
  const statuses = collection.data.fields.find((f) => f.id === "status")?.options ?? [];
  const set = (patch: Partial<typeof q>) => setSearch(taskQueryToSearch({ ...q, ...patch }));

  const status = (d: Doc) => {
    const option = statuses.find((o) => o.value === d.data.status);
    if (!option) return <span className="muted">—</span>;
    return (
      <span className="board-pill" style={pill(option.color)}>
        {columnName(option)}
      </span>
    );
  };
  const due = (d: Doc) => {
    if (d.data.due === undefined || d.data.due === null) return <span className="muted">—</span>;
    const label = dueLabel(d.data.due, today);
    return (
      <span className="board-pill" style={pill(TONE[label.tone])}>
        {label.text}
      </span>
    );
  };
  const priority = (d: Doc) =>
    d.data.priority === "high" ? (
      <span className="board-pill" data-emoji="🔥" style={pill("var(--bad)")}>
        High
      </span>
    ) : (
      <span className="muted">
        {typeof d.data.priority === "string" ? columnName({ value: d.data.priority }) : "—"}
      </span>
    );

  return (
    <div className="tasks-list">
      <div className="tasks-list-bar">
        <fieldset className="tasks-list-pills">
          <legend className="sr">Show</legend>
          {TASK_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="pill"
              aria-pressed={q.chip === c}
              onClick={() => set({ chip: c })}
            >
              {CHIP_LABEL[c]} <span className="num muted">{list.counts[c]}</span>
            </button>
          ))}
        </fieldset>
        <input
          className="input tasks-list-search"
          type="search"
          aria-label="Search tasks"
          placeholder="Search"
          value={q.text}
          onChange={(e) => set({ text: e.target.value })}
        />
      </div>
      <NewItem collection="tasks" preset={{ status: "todo" }} placeholder="New task" />
      <section className="panel tasks-list-table">
        <table className="table" aria-label="Tasks">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Due</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((d) => (
              <tr key={d.id} {...rowOpen(() => setOpen(d.id))}>
                <td className="tasks-list-title">
                  <button type="button" className="link" onClick={() => setOpen(d.id)}>
                    {titleOf(d)}
                  </button>
                </td>
                <td>{status(d)}</td>
                <td>{due(d)}</td>
                <td>{priority(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="num muted tasks-list-count">
          {list.rows.length === 0 ? "Nothing here." : `${list.rows.length} tasks`}
        </p>
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
