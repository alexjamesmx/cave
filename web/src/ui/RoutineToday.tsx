import { useRef } from "react";
import { newId } from "../../../shared/ids.ts";
import {
  blocksForDay,
  duration,
  endOf,
  isBlockDone,
  routineOf,
  weekdayOf,
} from "../../../shared/routine.ts";
import { useCave } from "../app/context.ts";
import { useSaver, useToday } from "../app/hooks.ts";
import { entriesByDay } from "../logic/habits.ts";
import { useDoc, useItems } from "../store/queries.ts";
import { Icon } from "./icon.tsx";

/**
 * A day's routine (M12 part 7): its fixed and daily blocks in time order, on the Agenda and
 * in the diary's day panel. A block with a habit is that habit's toggle for the day. `toggle`
 * lets the diary write through its own entry; without it the day's entry is written here,
 * created on the first tick.
 */
export function RoutineToday({
  day,
  toggle,
}: {
  day?: string;
  toggle?: (habit: string, done: boolean) => void;
}) {
  const { db } = useCave().local;
  const today = useToday();
  const date = day ?? today;
  const routine = routineOf(useDoc(db, "settings")?.data);
  const journal = useItems(db, "journal");
  const saver = useSaver("journal");
  const created = useRef<string>(undefined);
  const blocks = blocksForDay(routine, weekdayOf(date));
  if (blocks.length === 0) return null;
  const entry = entriesByDay(journal ?? []).get(date);
  const write = (habit: string, done: boolean) => {
    if (toggle) return toggle(habit, done);
    const id = entry?.id ?? created.current ?? newId();
    created.current = entry?.id ?? id;
    void saver.save(id, entry ? { [habit]: !done } : { date, _title: date, [habit]: !done });
  };
  return (
    <section
      className="panel"
      aria-label="Routine today"
      style={{ padding: 14, display: "grid", gap: 6 }}
    >
      <span className="k">
        Routine · {date === today ? "today" : date} ·{" "}
        <a className="link" href="/calendar/week">
          Week
        </a>
      </span>
      <ul className="agenda-list">
        {blocks.map((b) => {
          const done = isBlockDone(b, entry);
          return (
            <li key={b.id} className={`agenda-row${done ? " done" : ""}`}>
              <span
                className="mark"
                style={{ background: b.kind === "fixed" ? "var(--line)" : "var(--wait)" }}
              />
              <span className="num muted agenda-time">
                {b.start ? `${b.start}–${endOf(b)}` : duration(b.minutes)}
              </span>
              <span>{b.title}</span>
              {b.habit && (
                <button
                  type="button"
                  className="btn"
                  aria-pressed={done}
                  aria-label={`${b.title} done`}
                  style={{ marginLeft: "auto" }}
                  onClick={() => write(b.habit as string, done)}
                >
                  <Icon name="check" size={14} /> {done ? "Done" : "Mark done"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {saver.error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {saver.error}
        </p>
      )}
    </section>
  );
}
