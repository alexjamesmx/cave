import { useMemo } from "react";
import { monthGrid, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { useCave } from "../app/context.ts";
import { useFollowing, useToday } from "../app/hooks.ts";
import { entriesByDay, habitsDone } from "../logic/habits.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Diary → Months: a dot per day with an entry, the habits done under it; a day opens Write. */
export function DiaryMonths() {
  const { db } = useCave().local;
  const items = useItems(db, "journal");
  const journal = useCollections(db)?.find((c) => c.id === "journal");
  const today = useToday();
  const [month, setMonth] = useFollowing(monthOf(today));
  const byDay = useMemo(
    () => entriesByDay((items ?? []).filter((d) => d.data._deleted !== true)),
    [items],
  );
  const habits = (journal?.data.fields ?? []).filter((f) => f.type === "checkbox");
  const ids = habits.map((h) => h.id);
  const written = (day: string) => {
    const body = byDay.get(day)?.data._body;
    return typeof body === "string" && body.trim().length > 0;
  };

  return (
    <section
      className="panel"
      aria-label="Months"
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
            return (
              <a
                key={day}
                href={`/diary/write?day=${day}`}
                className={`day month-day${day === today ? " today" : ""}${entry ? " has-entry" : ""}`}
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
        A dot is a day you wrote; the strip under it is the habits you logged. Click a day to open
        it in Write.
      </span>
    </section>
  );
}
