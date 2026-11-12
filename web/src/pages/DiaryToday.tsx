import { useState } from "react";
import { shortDay } from "../../../shared/dates.ts";
import { useToday } from "../app/hooks.ts";
import { useSearch } from "../app/router.ts";
import { pick, shown } from "../logic/follow.ts";
import { nextDay, previousDay } from "../logic/habits.ts";
import { DiaryDay } from "../ui/DiaryDay.tsx";
import { Icon } from "../ui/icon.tsx";

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
        <header className="diary-head">
          <h2>
            {day === today ? "Today " : ""}
            <span className="muted">
              {shortDay(day)} {day.slice(0, 4)}
            </span>
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous day"
            onClick={() => setDay(previousDay(day))}
          >
            <Icon name="chevron-left" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
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
