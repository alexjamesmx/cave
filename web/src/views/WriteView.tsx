import { useMemo, useRef } from "react";
import { shortDay } from "../../../shared/dates.ts";
import { newId } from "../../../shared/ids.ts";
import { useFollowing, useSaver, useToday } from "../app/hooks.ts";
import { entriesByDay, previousDay } from "../logic/habits.ts";
import { Icon } from "../ui/icon.tsx";
import type { ViewProps } from "./types.ts";

const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** The journal's diary page: one entry per day, habits as toggles, text saved on blur. */
export function WriteView({ collection, items }: ViewProps) {
  const today = useToday();
  const [day, setDay] = useFollowing(today);
  const saver = useSaver(collection.id);
  const entry = useMemo(() => entriesByDay(items).get(day), [items, day]);
  const habits = collection.data.fields.filter((f) => f.type === "checkbox");
  const body = typeof entry?.data._body === "string" ? entry.data._body : "";

  // The day's entry is created on its first change, so browsing days writes nothing. The
  // new id is remembered: a second change can land before the live query shows the entry.
  const created = useRef(new Map<string, string>());
  const save = (patch: Record<string, unknown>) => {
    if (entry) return saver.save(entry.id, patch);
    const pending = created.current.get(day);
    if (pending) return saver.save(pending, patch);
    const id = newId();
    created.current.set(day, id);
    return saver.save(id, { date: day, _title: day, ...patch });
  };

  return (
    <section className="panel" style={{ padding: 20, display: "grid", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="k" style={{ flex: 1 }}>
          {day === today ? "Today" : ""} {shortDay(day)} {day.slice(0, 4)}
        </span>
        <button
          type="button"
          className="btn"
          aria-label="Previous day"
          onClick={() => setDay(previousDay(day))}
        >
          <Icon name="chevron-left" size={15} />
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Next day"
          disabled={day >= today}
          onClick={() => setDay(nextDay(day))}
        >
          <Icon name="chevron-right" size={15} />
        </button>
      </header>
      <textarea
        key={`${day}-${body}`}
        className="input diary-text"
        aria-label="Diary entry"
        rows={12}
        defaultValue={body}
        placeholder="How did today go?"
        onBlur={(e) => {
          if (e.target.value !== body) void save({ _body: e.target.value });
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {habits.map((h) => {
          const done = entry?.data[h.id] === true;
          return (
            <button
              key={h.id}
              type="button"
              className="chip"
              aria-pressed={done}
              onClick={() => void save({ [h.id]: !done })}
              style={{
                cursor: "pointer",
                border: "1px solid var(--control-border)",
                background: done ? "var(--lime)" : "var(--control)",
                color: done ? "var(--on-lime)" : "var(--text)",
              }}
            >
              {h.name}
            </button>
          );
        })}
      </div>
      {saver.error && (
        <p role="alert" className="error">
          {saver.error}
        </p>
      )}
    </section>
  );
}
