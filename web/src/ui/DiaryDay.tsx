import { type ReactNode, useMemo, useRef } from "react";
import { newId } from "../../../shared/ids.ts";
import { COLOR_FIELD } from "../../../shared/pages.ts";
import { useCave } from "../app/context.ts";
import { useSaver } from "../app/hooks.ts";
import { entriesByDay } from "../logic/habits.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { Icon } from "./icon.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";

/** A day's diary entry, if written, and the habits it can tick. */
export function useDiaryDay(day: string) {
  const { db } = useCave().local;
  const items = useItems(db, "journal");
  const journal = useCollections(db)?.find((c) => c.id === "journal");
  const entry = useMemo(() => entriesByDay(items ?? []).get(day), [items, day]);
  const habits = (journal?.data.fields ?? []).filter(
    (f) => f.type === "checkbox" && f.archived !== true,
  );
  return {
    entry,
    habits,
    body: typeof entry?.data._body === "string" ? entry.data._body : "",
    color: typeof entry?.data.color === "string" ? entry.data.color : "",
  };
}

/** Diary → Today: one day in a panel, always open for writing. */
export function DiaryDay({ day, header }: { day: string; header: ReactNode }) {
  return (
    <section
      className="panel diary-day"
      aria-label={`Day ${day}`}
      style={{ padding: 18, display: "grid", gap: 14 }}
    >
      {header}
      <DayEditor day={day} />
    </section>
  );
}

/**
 * Writing one diary day (M12 part 8): the entry in the Markdown editor, the habits as toggles,
 * a colour and Delete. The entry is created on its first change, so browsing days writes
 * nothing; its new id is remembered, since a second change can land before the live query
 * shows it.
 */
export function DayEditor({ day }: { day: string }) {
  const saver = useSaver("journal");
  const created = useRef(new Map<string, string>());
  const { entry, habits, body, color } = useDiaryDay(day);

  const save = (patch: Record<string, unknown>) => {
    if (entry) return saver.save(entry.id, patch);
    const pending = created.current.get(day);
    if (pending) return saver.save(pending, patch);
    const id = newId();
    created.current.set(day, id);
    return saver.save(id, { date: day, _title: day, ...patch });
  };
  const toggle = (habit: string, done: boolean) => void save({ [habit]: !done });
  const remove = () => {
    if (!entry) return;
    if (confirm(`Delete the entry for ${day}? It stays in the history and can be restored.`))
      void saver.save(entry.id, { _deleted: true }).then(() => created.current.delete(day));
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <MarkdownEditor
        key={day}
        id="diary-entry"
        label="Diary entry"
        value={body}
        rows={14}
        placeholder="How did today go?"
        onSave={(text) => void save({ _body: text })}
      />
      <fieldset aria-label="Habits" className="habit-toggles">
        {habits.map((h) => {
          const done = entry?.data[h.id] === true;
          return (
            <button
              key={h.id}
              type="button"
              className="chip habit-toggle"
              aria-pressed={done}
              onClick={() => toggle(h.id, done)}
            >
              {h.name}
            </button>
          );
        })}
      </fieldset>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="input"
          aria-label="Day colour"
          value={color}
          onChange={(e) => void save({ color: e.target.value || null })}
          style={{ width: "auto" }}
        >
          <option value="">No colour</option>
          {COLOR_FIELD.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
        {entry && (
          <button type="button" className="btn" onClick={remove} style={{ marginLeft: "auto" }}>
            <Icon name="trash" size={14} /> Delete entry
          </button>
        )}
      </div>
      {saver.error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {saver.error}
        </p>
      )}
    </div>
  );
}
