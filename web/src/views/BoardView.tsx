import { type CSSProperties, type KeyboardEvent, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { repeatOf } from "../../../shared/reminders.ts";
import { completeTask } from "../../../shared/tasks.ts";
import { setShowClosed, showClosed } from "../app/board-closed.ts";
import { useReminderZone, useSaver, useTimeZone } from "../app/hooks.ts";
import { byRank, dropPatch } from "../logic/board.ts";
import { CLOSED } from "../logic/task-list.ts";
import { groupBy, titleOf } from "../logic/views.ts";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import { Icon } from "../ui/icon.tsx";
import { useCardDrag } from "../ui/useCardDrag.ts";
import { NewItem } from "./NewItem.tsx";
import type { ViewProps } from "./types.ts";

// `data-column` can't hold null; the "no value" column uses this instead.
const NONE = "";

export function BoardView({ collection, view, items, open, preset }: ViewProps) {
  const { fields } = collection.data;
  const field = fields.find((f) => f.id === view.config.groupBy && f.type === "select");
  const saver = useSaver(collection.id);
  const timeZone = useTimeZone();
  const zone = useReminderZone();
  const [adding, setAdding] = useState(false);
  const isTasks = collection.id === "tasks";
  const [closedShown, setClosedShown] = useState(showClosed);

  const all = field ? groupBy(items, field).map((g) => ({ ...g, docs: byRank(g.docs) })) : [];
  // The tasks board is for the work in flight: Done and Dropped wait behind Show done.
  const isClosed = (value: string | null) => isTasks && value !== null && CLOSED.has(value);
  const closedCount = all.filter((g) => isClosed(g.value)).reduce((n, g) => n + g.docs.length, 0);
  const groups = closedShown ? all : all.filter((g) => !isClosed(g.value));
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
  // A card names its project, unless the board shows one project only.
  const projectField =
    preset?.project === undefined
      ? fields.find((f) => f.id === "project" && f.type === "ref")
      : undefined;
  const first = field.options?.[0]?.value;

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
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {first && !adding && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> {isTasks ? "New task" : "New item"}
          </button>
        )}
        {first && adding && (
          <div style={{ flex: "1 1 280px", maxWidth: 480 }}>
            <NewItem
              collection={collection.id}
              preset={{ ...preset, [field.id]: first }}
              placeholder={isTasks ? "New task" : "New item"}
              onCreated={() => setAdding(false)}
            />
          </div>
        )}
        {isTasks && (
          <button
            type="button"
            className="btn"
            aria-pressed={closedShown}
            onClick={toggleClosed}
            style={{ marginLeft: "auto" }}
          >
            <Icon name={closedShown ? "eye-off" : "eye"} size={15} />{" "}
            {closedShown ? "Hide done" : "Show done"}{" "}
            <span className="num muted">{closedCount}</span>
          </button>
        )}
      </div>
      {saver.error && (
        <p role="alert" className="error">
          {saver.error}
        </p>
      )}
      <div className="board">
        {groups.map((group) => {
          const column = group.value ?? NONE;
          const target = drag && drag.column === column ? drag.index : undefined;
          // Slots count the cards other than the dragged one, as the drop does.
          const rest = group.docs.filter((d) => d.id !== drag?.id);
          return (
            <section
              key={column || "__none"}
              className={`panel board-column${target !== undefined ? " drop-here" : ""}`}
              aria-label={group.value ?? "No value"}
              data-column={column}
            >
              <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {group.value ? (
                  <OptionChip field={field} value={group.value} />
                ) : (
                  <span className="k">No {field.name.toLowerCase()}</span>
                )}
                <span className="num muted">{group.docs.length}</span>
              </header>
              {group.docs.map((doc) => (
                <div key={doc.id} style={{ display: "contents" }}>
                  {target !== undefined && doc.id !== drag?.id && rest.indexOf(doc) === target && (
                    <div className="drop-line" />
                  )}
                  <button
                    type="button"
                    className={`card board-card${drag?.id === doc.id ? " dragging" : ""}${
                      isTasks && typeof doc.data.project === "string" ? " has-project" : ""
                    }`}
                    data-card={doc.id}
                    style={
                      drag?.id === doc.id
                        ? ({ transform: `translate(${drag.dx}px, ${drag.dy}px)` } as CSSProperties)
                        : undefined
                    }
                    onClick={() => open(doc.id)}
                    onKeyDown={(e) => onKey(e, doc.id, group.value)}
                    {...handlers(doc.id)}
                  >
                    <span className="board-title">{titleOf(doc)}</span>
                    <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                      {shownFields.map((f) =>
                        doc.data[f.id] === undefined ? null : (
                          <FieldValue key={f.id} field={f} value={doc.data[f.id]} />
                        ),
                      )}
                      {projectField && typeof doc.data.project === "string" && (
                        <span className="chip">
                          <FieldValue field={projectField} value={doc.data.project} />
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              ))}
              {target !== undefined && target >= rest.length && <div className="drop-line" />}
            </section>
          );
        })}
      </div>
    </>
  );
}
