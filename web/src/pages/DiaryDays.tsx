import { type FormEvent, useMemo, useState } from "react";
import { monthGrid, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { habitIconsOf, habitId } from "../../../shared/diary.ts";
import { colorToken } from "../../../shared/pages.ts";
import { useCave } from "../app/context.ts";
import { useFollowing, useToday } from "../app/hooks.ts";
import { editFields } from "../app/lists.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { doneInLast, entriesByDay, habitsDone, streak } from "../logic/habits.ts";
import { useCollections, useDoc, useItems } from "../store/queries.ts";
import { BarRow } from "../ui/charts.tsx";
import { DayReader } from "../ui/DayReader.tsx";
import { HabitEditor } from "../ui/HabitEditor.tsx";
import { Icon } from "../ui/icon.tsx";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Diary → Days (M12 part 8, Habits and Months until then): the month as a grid (a dot for a
 * written day, a strip of the habits logged, the day's colour as its tint) beside the habits'
 * 30 days and streaks with Add habit. A day (`?day=`) opens to be read, and edited on demand.
 */
export function DiaryDays() {
  const { local } = useCave();
  const items = useItems(local.db, "journal");
  const journal = useCollections(local.db)?.find((c) => c.id === "journal");
  const icons = habitIconsOf(useDoc(local.db, "settings")?.data);
  const today = useToday();
  const asked = new URLSearchParams(useSearch()).get("day");
  const open = asked && DAY_RE.test(asked) ? asked : undefined;
  const [month, setMonth] = useFollowing(monthOf(open ?? today));
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const byDay = useMemo(() => entriesByDay(items ?? []), [items]);
  const habits = (journal?.data.fields ?? []).filter(
    (f) => f.type === "checkbox" && f.archived !== true,
  );
  const ids = habits.map((h) => h.id);
  const written = (day: string) => {
    const body = byDay.get(day)?.data._body;
    return typeof body === "string" && body.trim().length > 0;
  };
  const addHabit = async (e: FormEvent) => {
    e.preventDefault();
    const title = name.trim();
    if (!title) return;
    const id = habitId(title);
    // A name that was archived comes back, with its ticks; a new one is added.
    await editFields(local, "journal", (fields) =>
      fields.some((f) => f.id === id)
        ? fields.map((f) => {
            if (f.id !== id) return f;
            const { archived: _, ...back } = f;
            return back;
          })
        : [...fields, { id, name: title, type: "checkbox" }],
    );
    setName("");
  };

  return (
    <div className="days-page">
      <section
        className="panel"
        aria-label="Days"
        style={{ padding: 16, display: "grid", gap: 10 }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="k" style={{ flex: 1 }}>
            {monthName(month)}
          </span>
          <button
            type="button"
            className="btn"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <Icon name="chevron-left" size={15} />
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <Icon name="chevron-right" size={15} />
          </button>
        </header>
        <div className="calendar months">
          {WEEKDAYS.map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: weekday initials repeat
            <span key={i} className="k">
              {d}
            </span>
          ))}
          {monthGrid(month)
            .flat()
            .map((day, i) => {
              if (!day) {
                // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no identity
                return <span key={`pad-${i}`} />;
              }
              const entry = byDay.get(day);
              const done = habitsDone(entry, ids);
              const tint = colorToken(entry?.data.color);
              return (
                <a
                  key={day}
                  href={`/notes/days?day=${day}`}
                  aria-current={day === open ? "date" : undefined}
                  className={`day month-day${day === today ? " today" : ""}${entry ? " has-entry" : ""}`}
                  style={
                    tint
                      ? { background: `color-mix(in srgb, ${tint} 26%, transparent)` }
                      : undefined
                  }
                  data-color={tint ? String(entry?.data.color) : undefined}
                  aria-label={`${shortDay(day)}${written(day) ? ", written" : ""}${
                    done.length ? `, ${done.length} habit${done.length === 1 ? "" : "s"}` : ""
                  }`}
                >
                  <span className="num">{Number(day.slice(8))}</span>
                  {written(day) && <span className="entry-dot" aria-hidden="true" />}
                  <span className="habit-strip" aria-hidden="true">
                    {ids.map((h) => (
                      <span key={h} className={`habit-pip${done.includes(h) ? " on" : ""}`} />
                    ))}
                  </span>
                </a>
              );
            })}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          A dot is a day you wrote, the strip under it the habits you logged, the tint its colour.
          Click a day to open it.
        </span>
      </section>
      <section
        className="panel"
        aria-label="Habits"
        style={{ padding: 16, display: "grid", gap: 10 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="k" style={{ flex: 1 }}>
            {editing ? "Edit habits" : "Last 30 days · streak"}
          </span>
          {!editing && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={14} /> Edit habits
            </button>
          )}
        </div>
        {editing && (
          <HabitEditor fields={journal?.data.fields ?? []} onDone={() => setEditing(false)} />
        )}
        {!editing && habits.length === 0 && <span className="muted">No habits yet.</span>}
        {(editing ? [] : habits).map((h) => {
          const n = doneInLast(byDay, h.id, today, 30);
          return (
            <BarRow
              key={h.id}
              label={
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Icon name={icons[h.id] ?? "circle-check"} size={14} />
                  {h.name}
                </span>
              }
              value={`${n}/30 · ${streak(byDay, h.id, today)}d`}
              share={n / 30}
              color="var(--lime)"
            />
          );
        })}
        <form onSubmit={(e) => void addHabit(e)} style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            aria-label="New habit"
            placeholder="New habit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Add habit
          </button>
        </form>
      </section>
      {open && (
        <DayReader
          key={open}
          day={open}
          today={today}
          onDay={(day) => setSearch(`?day=${day}`)}
          onClose={() => setSearch("")}
        />
      )}
    </div>
  );
}
