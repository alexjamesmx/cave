import { useMemo, useState } from "react";
import type { Doc } from "../../../shared/types.ts";
import { useToday } from "../app/hooks.ts";
import { dayOf, monthGrid, monthName, monthOf, shiftMonth } from "../logic/dates.ts";
import { titleOf } from "../logic/views.ts";
import { Icon } from "../ui/icon.tsx";
import type { ViewProps } from "./types.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ collection, view, items, open }: ViewProps) {
  const today = useToday();
  const [month, setMonth] = useState(() => monthOf(today));
  const fieldId = String(view.config.dateField ?? "");
  const field = collection.data.fields.find((f) => f.id === fieldId && f.type === "date");

  const byDay = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const doc of items) {
      const day = dayOf(doc.data[fieldId]);
      if (day) map.set(day, [...(map.get(day) ?? []), doc]);
    }
    return map;
  }, [items, fieldId]);
  if (!field) return <p className="muted">This calendar needs a date field.</p>;
  const undated = items.filter((d) => !dayOf(d.data[fieldId])).length;

  return (
    <section className="panel" style={{ padding: 16, display: "grid", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="btn"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <Icon name="chevron-left" size={15} />
        </button>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>{monthName(month)}</h2>
        <button type="button" className="btn" onClick={() => setMonth(monthOf(today))}>
          Today
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
      <div className="calendar">
        {WEEKDAYS.map((d) => (
          <span key={d} className="k">
            {d}
          </span>
        ))}
        {monthGrid(month)
          .flat()
          .map((day, i) =>
            day ? (
              <div key={day} className={`day${day === today ? " today" : ""}`}>
                <span className="num muted">{Number(day.slice(8))}</span>
                {(byDay.get(day) ?? []).map((doc) => (
                  <button key={doc.id} type="button" className="event" onClick={() => open(doc.id)}>
                    {titleOf(doc)}
                  </button>
                ))}
              </div>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no identity
              <div key={`pad-${i}`} />
            ),
          )}
      </div>
      {undated > 0 && (
        <span className="muted" style={{ fontSize: 12 }}>
          {undated} without a {field.name.toLowerCase()} date (see the table).
        </span>
      )}
    </section>
  );
}
