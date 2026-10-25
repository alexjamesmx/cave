import { useState } from "react";
import { shortDay } from "../../../shared/dates.ts";
import { useToday } from "../app/hooks.ts";
import { useSearch } from "../app/router.ts";
import { pick, shown } from "../logic/follow.ts";
import { previousDay } from "../logic/habits.ts";
import { DiaryDay } from "../ui/DiaryDay.tsx";
import { Icon } from "../ui/icon.tsx";

const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Diary → Today (M12 part 8, Write until then): one day full width, following today until
 * another is picked with the arrows or `?day=`, so a diary left open past midnight moves on.
 */
export function DiaryToday() {
  const today = useToday();
  const asked = new URLSearchParams(useSearch()).get("day");
  const [picked, setPicked] = useState(
    asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : undefined,
  );
  const day = shown(picked, today);
  const setDay = (value: string) => setPicked(pick(value, today));
  return (
    <DiaryDay
      day={day}
      header={
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
      }
    />
  );
}
