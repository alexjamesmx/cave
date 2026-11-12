import { type CSSProperties, useMemo, useRef } from "react";
import { monthGrid, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { PAYMENTS } from "../../../shared/payments.ts";
import { useCave } from "../app/context.ts";
import { useFollowing, useNow, useReminderZone, useToday } from "../app/hooks.ts";
import type { AgendaType } from "../logic/agenda.ts";
import {
  byDay,
  type CalendarEvent,
  dayStart,
  mergeEvents,
  paymentSource,
  reminderSource,
  taskSource,
} from "../logic/calendar.ts";
import { useItems } from "../store/queries.ts";
import { AgendaGroups, TYPE_LOOK } from "../ui/AgendaList.tsx";
import { QuickReminder } from "../ui/QuickReminder.tsx";
import { useAgenda } from "../ui/useAgenda.ts";
import { useAgendaActions } from "../ui/useAgendaActions.tsx";
import { useFillHeight } from "../ui/useFillHeight.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Pills a day shows before the rest fold into "+N more". */
const MAX_PILLS = 3;

const TYPE_OF: Record<string, AgendaType> = {
  reminders: "reminder",
  tasks: "task",
  [PAYMENTS]: "payment",
};

/** Each day's entries in `month`: reminders with their repeats, open tasks, active payments. */
function useMonthEvents(month: string): Map<string, CalendarEvent[]> {
  const { db } = useCave().local;
  const reminders = useItems(db, "reminders");
  const tasks = useItems(db, "tasks");
  const payments = useItems(db, PAYMENTS);
  const zone = useReminderZone();
  const now = useNow().getTime();
  const today = useToday();
  return useMemo(() => {
    if (!reminders || !tasks || !payments) return new Map();
    const range = {
      from: dayStart(`${month}-01`, zone.timeZone),
      to: dayStart(`${shiftMonth(month, 1)}-01`, zone.timeZone),
    };
    const sources = [
      reminderSource(reminders, zone, now),
      taskSource(tasks, zone, today),
      paymentSource(payments, zone, now),
    ];
    return byDay(mergeEvents(sources, range));
  }, [reminders, tasks, payments, zone, now, today, month]);
}

/**
 * Calendar → Month: the month grid with each day's reminders, tasks and payments as typed
 * pills (dots on a phone), beside Upcoming: the quick add and everything with a date by when,
 * the same list as the Agenda tab. A day's number adds a reminder on it; an entry opens it.
 */
export function Calendar() {
  const today = useToday();
  const [month, setMonth] = useFollowing(monthOf(today));
  const events = useMonthEvents(month);
  const upcoming = useAgenda();
  const actions = useAgendaActions();
  const page = useRef<HTMLDivElement>(null);
  useFillHeight(page);
  const grid = monthGrid(month);

  const pill = (e: CalendarEvent) => {
    const type = TYPE_OF[e.collection] ?? "reminder";
    const look = TYPE_LOOK[type];
    return (
      <button
        key={e.key}
        type="button"
        className={`cal-ev${e.done ? " done" : ""}`}
        style={{ "--c": look.color } as CSSProperties}
        onClick={() => actions.open(type, e.itemId)}
      >
        <span className="cal-ev-mark" aria-hidden="true" data-emoji={look.emoji} />
        <span className="cal-ev-title">
          {e.time && `${e.time} `}
          {e.title}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="cal-page" ref={page}>
        <section className="panel cal-month" aria-label="Month">
          <header className="cal-month-head">
            <h2>{monthName(month)}</h2>
            <ul className="cal-legend" aria-label="Legend">
              {Object.values(TYPE_LOOK).map((t) => (
                <li key={t.label} data-emoji={t.emoji}>
                  {t.label}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="icon-btn"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn cal-today"
              onClick={() => setMonth(monthOf(today))}
            >
              Today
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </header>
          <div className="cal-weekdays" aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cal-grid">
            {grid.flat().map((day, i) => {
              if (!day)
                // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no identity
                return <div key={`pad-${i}`} className="cal-day pad" />;
              const list = events.get(day) ?? [];
              const shown = list.length > MAX_PILLS ? list.slice(0, MAX_PILLS - 1) : list;
              return (
                <div
                  key={day}
                  className={`cal-day${day === today ? " today" : ""}${day < today ? " past" : ""}`}
                >
                  <button
                    type="button"
                    className="cal-day-add num"
                    aria-label={`New reminder on ${shortDay(day)}`}
                    aria-current={day === today ? "date" : undefined}
                    onClick={() => actions.add(day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                  {shown.map(pill)}
                  {shown.length < list.length && (
                    <span className="cal-more">+{list.length - shown.length} more</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel cal-upcoming" aria-label="Upcoming">
          <QuickReminder />
          <div className="cal-upcoming-list">
            {upcoming && (
              <AgendaGroups
                groups={upcoming.groups}
                today={today}
                open={(it) => actions.open(it.type, it.id)}
                done={actions.done}
              />
            )}
          </div>
        </section>
      </div>
      {actions.overlay}
    </>
  );
}
