import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { localDateTime } from "../../../shared/dates.ts";
import { repeatOf } from "../../../shared/reminders.ts";
import type { Field } from "../../../shared/schema.ts";
import { completeTask } from "../../../shared/tasks.ts";
import type { Doc } from "../../../shared/types.ts";
import { setShowClosed, showClosed } from "../app/board-closed.ts";
import { useReminderZone, useSaver, useTimeZone, useToday } from "../app/hooks.ts";
import { byRank, columnName, type DueTone, dropPatch, dueLabel } from "../logic/board.ts";
import { CLOSED } from "../logic/task-list.ts";
import { groupBy, titleOf } from "../logic/views.ts";
import { FieldValue } from "../ui/fields.tsx";
import { useCardDrag } from "../ui/useCardDrag.ts";
import { useFillHeight } from "../ui/useFillHeight.ts";
import type { ViewProps } from "./types.ts";

// `data-column` can't hold null; the "no value" column uses this instead.
const NONE = "";

const TONE: Record<DueTone, string> = {
  bad: "var(--bad)",
  warn: "var(--warn)",
  plain: "#c3c8d1",
};

/** What a card shows under its title. */
function CardMeta({ doc, fields, today }: { doc: Doc; fields: Field[]; today: string }) {
  if (doc.collection !== "tasks")
    return (
      <span className="board-meta">
        {fields.map((f) =>
          doc.data[f.id] === undefined ? null : (
            <FieldValue key={f.id} field={f} value={doc.data[f.id]} />
          ),
        )}
      </span>
    );
  // A task shows its priority only when high; the due date reads relative to today.
  const due = dueLabel(doc.data.due, today);
  return (
    <span className="board-meta">
      {doc.data.priority === "high" && (
        <span
          className="board-pill"
          data-emoji="🔥"
          style={{ "--c": "var(--bad)" } as CSSProperties}
        >
          High
        </span>
      )}
      <span className="board-pill" style={{ "--c": TONE[due.tone] } as CSSProperties}>
        {due.text}
      </span>
    </span>
  );
}

/** A column's inline add: Enter adds and stays for the next; Escape, or leaving it empty, closes. */
function ColumnAdd({
  placeholder,
  onAdd,
  onClose,
}: {
  placeholder: string;
  onAdd(title: string): Promise<boolean>;
  onClose(): void;
}) {
  const [title, setTitle] = useState("");
  return (
    <form
      className="board-add"
      onSubmit={(e) => {
        e.preventDefault();
        const text = title.trim();
        if (text) void onAdd(text).then((ok) => ok && setTitle(""));
      }}
    >
      <input
        className="input"
        // biome-ignore lint/a11y/noAutofocus: the add opens to type
        autoFocus
        aria-label={placeholder}
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        onBlur={() => !title.trim() && onClose()}
      />
    </form>
  );
}

export function BoardView({ collection, view, items, open }: ViewProps) {
  const { fields } = collection.data;
  const field = fields.find((f) => f.id === view.config.groupBy && f.type === "select");
  const saver = useSaver(collection.id);
  const timeZone = useTimeZone();
  const zone = useReminderZone();
  const today = useToday();
  const isTasks = collection.id === "tasks";
  const [closedShown, setClosedShown] = useState(showClosed);
  // The column whose inline add is open.
  const [adding, setAdding] = useState<string>();
  const board = useRef<HTMLDivElement>(null);
  useFillHeight(board);

  const all = field ? groupBy(items, field).map((g) => ({ ...g, docs: byRank(g.docs) })) : [];
  // The tasks board is for the work in flight: Done and Dropped wait behind Show done.
  const isClosed = (value: string | null) => isTasks && value !== null && CLOSED.has(value);
  const closedCount = all.filter((g) => isClosed(g.value)).reduce((n, g) => n + g.docs.length, 0);
  const groups = all.filter(
    (g) => (closedShown || !isClosed(g.value)) && (g.value !== null || g.docs.length > 0),
  );
  const toggleClosed = () => {
    setShowClosed(!closedShown);
    setClosedShown(!closedShown);
  };
  const move = (id: string, column: string, index: number) => {
    const doc = items.find((d) => d.id === id);
    const group = all.find((g) => (g.value ?? NONE) === column);
    if (!doc || !group || !field) return;
    const repeating = isTasks && group.value === "done" && repeatOf(doc.data) !== "none";
    if (repeating) {
      const now = localDateTime(new Date(), timeZone);
      void saver.save(id, completeTask(doc, Date.now(), zone, now));
      return;
    }
    const patch = dropPatch({
      doc,
      field: field.id,
      value: group.value,
      column: group.docs.filter((d) => d.id !== id),
      index,
      tasks: isTasks,
      now: localDateTime(new Date(), timeZone),
    });
    void saver.save(id, patch);
  };
  const { drag, handlers } = useCardDrag((id, target) => move(id, target.column, target.index));

  if (!field) return <p className="muted">This board needs a select field to group by.</p>;
  const shownFields = fields.filter((f) => f.id !== field.id && f.type !== "ref").slice(0, 2);
  const first = field.options?.[0]?.value;
  const noun = isTasks ? "task" : "item";
  const dragged = drag && items.find((d) => d.id === drag.id);

  // Left and right move a focused card to the end of the next column, a hidden one included.
  const onKey = (e: KeyboardEvent, id: string, value: string | null) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    const next = all[all.findIndex((g) => g.value === value) + step];
    if (!step || !next) return;
    e.preventDefault();
    move(id, next.value ?? NONE, next.docs.filter((d) => d.id !== id).length);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)?.focus(),
    );
  };

  return (
    <>
      <div className="board-bar">
        {isTasks && (
          <button type="button" className="btn" aria-pressed={closedShown} onClick={toggleClosed}>
            {closedShown ? "Hide done" : "Show done"}{" "}
            <span className="num muted">· {closedCount}</span>
          </button>
        )}
        {first && (
          <button type="button" className="btn primary" onClick={() => setAdding(first)}>
            + New {noun}
          </button>
        )}
      </div>
      {saver.error && (
        <p role="alert" className="error">
          {saver.error}
        </p>
      )}
      <div className="board" ref={board}>
        {groups.map((group) => {
          const column = group.value ?? NONE;
          const option = field.options?.find((o) => o.value === group.value);
          const name = option ? columnName(option) : `No ${field.name.toLowerCase()}`;
          const target = drag && drag.column === column ? drag.index : undefined;
          // Slots count the cards other than the dragged one, as the drop does.
          const rest = group.docs.filter((d) => d.id !== drag?.id);
          // A task added straight to Done or Dropped would skip its stamp; those take drops only.
          const canAdd = group.value !== null && !isClosed(group.value);
          const slot = <div className="board-slot" style={{ height: drag?.from.height }} />;
          return (
            <section
              key={column || "__none"}
              className={`board-column${target !== undefined ? " drop-here" : ""}`}
              aria-label={name}
              data-column={column}
              style={{ "--c": option?.color ?? "var(--muted)" } as CSSProperties}
            >
              <header className="board-column-head">
                <span className="board-dot" aria-hidden="true" />
                <b>{name}</b>
                <span className="num muted">{group.docs.length}</span>
                {canAdd && (
                  <button
                    type="button"
                    className="board-column-add"
                    aria-label={`Add to ${name}`}
                    onClick={() => setAdding(column)}
                  >
                    +
                  </button>
                )}
              </header>
              <div className="board-cards">
                {group.docs.map((doc) => (
                  <div key={doc.id} style={{ display: "contents" }}>
                    {target !== undefined &&
                      doc.id !== drag?.id &&
                      rest.indexOf(doc) === target &&
                      slot}
                    <button
                      type="button"
                      className={`board-card${doc.data.priority === "high" && isTasks ? " high" : ""}${drag?.id === doc.id ? " lifted" : ""}`}
                      data-card={doc.id}
                      onClick={() => open(doc.id)}
                      onKeyDown={(e) => onKey(e, doc.id, group.value)}
                      {...handlers(doc.id)}
                    >
                      <span className="board-title">{titleOf(doc)}</span>
                      <CardMeta doc={doc} fields={shownFields} today={today} />
                    </button>
                  </div>
                ))}
                {target !== undefined && target >= rest.length && slot}
                {canAdd &&
                  (adding === column ? (
                    <ColumnAdd
                      placeholder={`New ${noun}`}
                      onAdd={async (title) =>
                        (await saver.create({ [field.id]: group.value, _title: title })) !==
                        undefined
                      }
                      onClose={() => setAdding(undefined)}
                    />
                  ) : (
                    <button type="button" className="board-ghost" onClick={() => setAdding(column)}>
                      + Add a {noun}
                    </button>
                  ))}
              </div>
            </section>
          );
        })}
      </div>
      {drag &&
        dragged &&
        // Above the columns, so it isn't clipped by the one it leaves; the pointer passes through.
        createPortal(
          <div
            className={`board-card floating${dragged.data.priority === "high" && isTasks ? " high" : ""}`}
            aria-hidden="true"
            style={{
              left: drag.from.left + drag.dx,
              top: drag.from.top + drag.dy,
              width: drag.from.width,
            }}
          >
            <span className="board-title">{titleOf(dragged)}</span>
            <CardMeta doc={dragged} fields={shownFields} today={today} />
          </div>,
          document.body,
        )}
    </>
  );
}
