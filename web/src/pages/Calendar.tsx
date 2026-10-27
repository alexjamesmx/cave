import { type CSSProperties, useMemo, useState } from "react";
import { monthGrid, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { PAYMENTS } from "../../../shared/payments.ts";
import { useCave } from "../app/context.ts";
import { useFollowing, useNow, useReminderZone, useToday } from "../app/hooks.ts";
import { flowPath, navigate } from "../app/router.ts";
import {
  addDays,
  byDay,
  type CalendarEvent,
  type CalendarSource,
  dayStart,
  flowSource,
  mergeEvents,
  paymentSource,
  reminderSource,
  taskSource,
} from "../logic/calendar.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";
import { ReminderActions } from "../ui/ReminderActions.tsx";
import { ReminderSheet } from "../ui/ReminderForm.tsx";
import { rowOpen } from "../ui/row-open.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AGENDA_DAYS = 14;

/** Every source's entries: the month grid and the agenda read only through these. */
function useSources(): CalendarSource[] | undefined {
  const { db } = useCave().local;
  const reminders = useItems(db, "reminders");
  const tasks = useItems(db, "tasks");
  const flows = useItems(db, FLOWS);
  const payments = useItems(db, PAYMENTS);
  const zone = useReminderZone();
  const now = useNow().getTime();
  const today = useToday();
  return useMemo(
    () =>
      reminders && tasks && flows && payments
        ? [
            reminderSource(reminders, zone, now),
            taskSource(tasks, zone, today),
            flowSource(flows, zone, now),
            paymentSource(payments, zone, now),
          ]
        : undefined,
    [reminders, tasks, flows, payments, zone, now, today],
  );
}

/**
 * Calendar → Month: the month grid beside what is coming up (overdue, then the next two
 * weeks, from every source). A day's number adds a reminder on it; an entry opens its item.
 */
export function Calendar() {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const sources = useSources();
  const today = useToday();
  const zone = useReminderZone();
  const [month, setMonth] = useFollowing(monthOf(today));
  const [open, setOpen] = useState<{ id: string; collection: string }>();
  // A reminder in the sheet: a new one on a day, or an existing one by id.
  const [reminder, setReminder] = useState<{ day?: string; id?: string }>();
  const reminders = useItems(db, "reminders");

  const color = (collection: string) =>
    collections?.find((c) => c.id === collection)?.data.color ?? "var(--muted)";
  const grid = monthGrid(month);
  const monthEvents = useMemo(() => {
    if (!sources) return new Map<string, CalendarEvent[]>();
    const range = {
      from: dayStart(`${month}-01`, zone.timeZone),
      to: dayStart(`${shiftMonth(month, 1)}-01`, zone.timeZone),
    };
    return byDay(mergeEvents(sources, range));
  }, [sources, month, zone]);
  const agenda = useMemo(() => {
    if (!sources) return undefined;
    // From the beginning of time, so anything overdue still shows at the top.
    const range = { from: 0, to: dayStart(addDays(today, AGENDA_DAYS), zone.timeZone) };
    // Computed repeats belong to the month grid; the agenda lists what is stored.
    return mergeEvents(sources, range).filter((e) => !e.repeat && (e.day >= today || e.overdue));
  }, [sources, today, zone]);

  const openCollection = open && collections?.find((c) => c.id === open.collection);
  const show = (e: CalendarEvent) =>
    e.collection === FLOWS
      ? navigate(flowPath(e.itemId))
      : e.collection === "reminders"
        ? setReminder({ id: e.itemId })
        : setOpen({ id: e.itemId, collection: e.collection });
  const editing = reminder?.id ? reminders?.find((r) => r.id === reminder.id) : undefined;

  return (
    <>
      <div className="calendar-page">
        <section
          className="panel"
          aria-label="Month"
          style={{ padding: 16, display: "grid", gap: 12 }}
        >
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
            {grid.flat().map((day, i) =>
              day ? (
                <div key={day} className={`day${day === today ? " today" : ""}`}>
                  <button
                    type="button"
                    className="day-add num muted"
                    aria-label={`New reminder on ${shortDay(day)}`}
                    onClick={() => setReminder({ day })}
                  >
                    {Number(day.slice(8))}
                  </button>
                  {(monthEvents.get(day) ?? []).map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      className={`event${e.done ? " done" : ""}`}
                      style={{ "--mark": color(e.collection) } as CSSProperties}
                      onClick={() => show(e)}
                    >
                      {e.repeat && <Icon name="repeat" size={11} aria-label="repeats" />}
                      {e.time && <span className="num">{e.time} </span>}
                      {e.title}
                    </button>
                  ))}
                </div>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no identity
                <div key={`pad-${i}`} />
              ),
            )}
          </div>
        </section>
        {agenda && (
          <Agenda
            events={agenda}
            today={today}
            color={color}
            open={show}
            onNew={() => setReminder({ day: today })}
          />
        )}
      </div>
      {reminder && (!reminder.id || editing) && (
        <ReminderSheet
          key={reminder.id ?? reminder.day}
          doc={editing}
          day={reminder.day}
          onClose={() => setReminder(undefined)}
        />
      )}
      {open && openCollection && (
        <ItemDrawer
          key={open.id}
          collection={withActiveFields(openCollection)}
          id={open.id}
          onClose={() => setOpen(undefined)}
        />
      )}
    </>
  );
}

function Agenda({
  events,
  today,
  color,
  open,
  onNew,
}: {
  events: CalendarEvent[];
  today: string;
  color(collection: string): string;
  open(event: CalendarEvent): void;
  onNew(): void;
}) {
  const { db } = useCave().local;
  const reminders = useItems(db, "reminders");
  const overdue = events.filter((e) => e.overdue);
  const days = byDay(events.filter((e) => !e.overdue));
  const doc = (id: string) => reminders?.find((d) => d.id === id);

  const row = (e: CalendarEvent) => {
    const stored = !e.repeat && e.collection === "reminders" ? doc(e.itemId) : undefined;
    return (
      <li
        key={e.key}
        className={`agenda-row${e.done ? " done" : ""}${e.overdue ? " overdue" : ""}`}
        {...rowOpen(() => open(e))}
      >
        <span className="mark" style={{ background: color(e.collection) }} />
        <span className="num muted agenda-time">{e.time ?? "all day"}</span>
        <button type="button" className="link" onClick={() => open(e)}>
          {e.repeat && <Icon name="repeat" size={12} aria-label="repeats" />} {e.title}
        </button>
        {stored && <ReminderActions doc={stored} />}
      </li>
    );
  };

  return (
    <section
      className="panel agenda"
      aria-label="Upcoming"
      style={{ padding: 16, display: "grid", gap: 12 }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>Upcoming</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {AGENDA_DAYS} days
        </span>
        <button
          type="button"
          className="btn primary icon-btn"
          aria-label="New reminder"
          title="New reminder"
          onClick={onNew}
        >
          <Icon name="plus" size={15} />
        </button>
      </header>
      {overdue.length > 0 && (
        <div>
          <span className="k error">Overdue</span>
          <ul className="agenda-list">{overdue.map(row)}</ul>
        </div>
      )}
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <span className={`k${day === today ? " agenda-today" : ""}`}>
            {day === today ? "Today" : shortDay(day)}
          </span>
          <ul className="agenda-list">{list.map(row)}</ul>
        </div>
      ))}
      {events.length === 0 && <span className="muted">Nothing due in the next two weeks.</span>}
    </section>
  );
}
