import { useMemo } from "react";
import { monthGrid, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { useFollowing, useToday } from "../app/hooks.ts";
import { doneInLast, entriesByDay, habitsDone, streak } from "../logic/habits.ts";
import { BarRow } from "../ui/charts.tsx";
import { Icon } from "../ui/icon.tsx";
import type { ViewProps } from "./types.ts";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function HabitsDashboard({ collection, view, items }: ViewProps) {
  const today = useToday();
  const [month, setMonth] = useFollowing(monthOf(today));
  const byDay = useMemo(() => entriesByDay(items), [items]);
  const habits = collection.data.fields.filter((f) => f.type === "checkbox");
  const ids = habits.map((h) => h.id);
  const icons = new Map(
    ((view.config.habits as { id: string; icon: string }[] | undefined) ?? []).map((h) => [
      h.id,
      h.icon,
    ]),
  );

  return (
    <div className="split">
      <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="k" style={{ flex: 1 }}>
            {monthName(month)} · habits per day
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
        <div className="calendar compact">
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
              const done = habitsDone(byDay.get(day), ids);
              const share = ids.length ? done.length / ids.length : 0;
              return (
                <span
                  key={day}
                  className={`day habit-day${day === today ? " today" : ""}`}
                  title={`${shortDay(day)}: ${done.length ? done.join(", ") : "no habits logged"}`}
                  style={{ background: `rgba(143, 208, 160, ${0.06 + share * 0.6})` }}
                >
                  <span className="num">{Number(day.slice(8))}</span>
                  <span className="num" style={{ fontSize: 10 }}>
                    {done.length || ""}
                  </span>
                </span>
              );
            })}
        </div>
      </section>
      <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <span className="k">Last 30 days · streak</span>
        {habits.map((h) => {
          const done = doneInLast(byDay, h.id, today, 30);
          return (
            <BarRow
              key={h.id}
              label={
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Icon name={icons.get(h.id) ?? "circle-check"} size={14} />
                  {h.name}
                </span>
              }
              value={`${done}/30 · ${streak(byDay, h.id, today)}d`}
              share={done / 30}
              color="var(--lime)"
            />
          );
        })}
      </section>
    </div>
  );
}
