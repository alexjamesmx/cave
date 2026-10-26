import { useRef } from "react";
import { newId } from "../../../shared/ids.ts";
import {
  blocksForDay,
  duration,
  endOf,
  isBlockDone,
  type RoutineBlock,
  routineOf,
  weekdayOf,
} from "../../../shared/routine.ts";
import { useCave } from "../app/context.ts";
import { useSaver, useToday } from "../app/hooks.ts";
import { entriesByDay } from "../logic/habits.ts";
import { useDoc, useItems } from "../store/queries.ts";
import { Icon } from "./icon.tsx";

/**
 * A day's routine blocks and their habit ticks. `toggle` lets the diary write through its own
 * entry; without it the day's entry is written here, created on the first tick.
 */
export function useRoutineDay(date: string, toggle?: (habit: string, done: boolean) => void) {
  const { db } = useCave().local;
  const routine = routineOf(useDoc(db, "settings")?.data);
  const journal = useItems(db, "journal");
  const saver = useSaver("journal");
  const created = useRef<string>(undefined);
  const entry = entriesByDay(journal ?? []).get(date);
  const mark = (habit: string, done: boolean) => {
    if (toggle) return toggle(habit, done);
    const id = entry?.id ?? created.current ?? newId();
    created.current = entry?.id ?? id;
    void saver.save(id, entry ? { [habit]: !done } : { date, _title: date, [habit]: !done });
  };
  return {
    blocks: blocksForDay(routine, weekdayOf(date)),
    isDone: (b: RoutineBlock) => isBlockDone(b, entry),
    mark,
    error: saver.error,
  };
}

/** One routine block as a row: its time, title and, with a habit, the day's tick. */
export function BlockRow({
  block,
  done,
  onMark,
}: {
  block: RoutineBlock;
  done: boolean;
  onMark(habit: string, done: boolean): void;
}) {
  return (
    <li className={`agenda-row routine-row${done ? " done" : ""}`}>
      <span
        className="mark"
        style={{ background: block.kind === "fixed" ? "var(--line)" : "var(--wait)" }}
      />
      <span className="num muted agenda-time">
        {block.start ? `${block.start}–${endOf(block)}` : duration(block.minutes)}
      </span>
      <span>{block.title}</span>
      {block.habit && (
        <button
          type="button"
          className="btn"
          aria-pressed={done}
          aria-label={`${block.title} done`}
          style={{ marginLeft: "auto" }}
          onClick={() => onMark(block.habit as string, done)}
        >
          <Icon name="check" size={14} /> {done ? "Done" : "Mark done"}
        </button>
      )}
    </li>
  );
}

/** A day's routine (M12 part 7) in the diary's day panel. */
export function RoutineToday({
  day,
  toggle,
}: {
  day?: string;
  toggle?: (habit: string, done: boolean) => void;
}) {
  const today = useToday();
  const date = day ?? today;
  const { blocks, isDone, mark, error } = useRoutineDay(date, toggle);
  if (blocks.length === 0) return null;
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
        {blocks.map((b) => (
          <BlockRow key={b.id} block={b} done={isDone(b)} onMark={mark} />
        ))}
      </ul>
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </section>
  );
}
