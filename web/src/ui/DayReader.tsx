import { useState } from "react";
import { habitIconsOf } from "../../../shared/diary.ts";
import { colorToken } from "../../../shared/pages.ts";
import { useCave } from "../app/context.ts";
import { nextDay, previousDay } from "../logic/habits.ts";
import { useDoc } from "../store/queries.ts";
import { DayEditor, useDiaryDay } from "./DiaryDay.tsx";
import { Icon } from "./icon.tsx";
import { MarkdownView } from "./Markdown.tsx";
import { Sheet } from "./Sheet.tsx";

const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * One diary day opened from Days: the entry read as rendered Markdown, the habits done and
 * the day's colour. Edit swaps in the editor; the arrows walk the days without closing.
 */
export function DayReader({
  day,
  today,
  onDay,
  onClose,
}: {
  day: string;
  today: string;
  onDay(day: string): void;
  onClose(): void;
}) {
  const [editing, setEditing] = useState(false);
  const { entry, habits, body } = useDiaryDay(day);
  const icons = habitIconsOf(useDoc(useCave().local.db, "settings")?.data);
  const tint = colorToken(entry?.data.color);
  const done = habits.filter((h) => entry?.data[h.id] === true);

  return (
    <Sheet
      title={`Day ${day}`}
      wide
      onClose={onClose}
      heading={
        <div className="reader-heading">
          {tint && <span className="reader-tint" style={{ background: tint }} aria-hidden />}
          <h2>{longDay(day)}</h2>
          {day === today && <span className="chip reader-today">Today</span>}
        </div>
      }
      actions={
        <div className="reader-actions">
          <button
            type="button"
            className="btn"
            aria-label="Previous day"
            onClick={() => onDay(previousDay(day))}
          >
            <Icon name="chevron-left" size={15} />
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Next day"
            disabled={day >= today}
            onClick={() => onDay(nextDay(day))}
          >
            <Icon name="chevron-right" size={15} />
          </button>
          <button
            type="button"
            className={`btn${editing ? "" : " primary"}`}
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            <Icon name={editing ? "book-open" : "pencil"} size={14} /> {editing ? "Read" : "Edit"}
          </button>
        </div>
      }
    >
      {editing ? (
        <DayEditor day={day} />
      ) : (
        <article className="reader" aria-label="Entry">
          {body.trim() ? (
            <div className="reader-text">
              <MarkdownView text={body} />
            </div>
          ) : (
            <p className="muted reader-empty">
              Nothing written on this day.{" "}
              <button type="button" className="link" onClick={() => setEditing(true)}>
                Write it
              </button>
            </p>
          )}
          {habits.length > 0 && (
            <section className="reader-habits" aria-label="Habits done">
              <span className="k">
                Habits · {done.length} of {habits.length}
              </span>
              <span className="reader-habit-list">
                {habits.map((h) => {
                  const on = done.includes(h);
                  return (
                    <span key={h.id} className={`reader-habit${on ? " on" : ""}`}>
                      <Icon name={on ? (icons[h.id] ?? "circle-check") : "circle"} size={13} />
                      {h.name}
                    </span>
                  );
                })}
              </span>
            </section>
          )}
        </article>
      )}
    </Sheet>
  );
}
