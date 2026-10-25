import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { monthGrid, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { newId } from "../../../shared/ids.ts";
import { PAYMENTS } from "../../../shared/payments.ts";
import { zonedInstant } from "../../../shared/reminders.ts";
import { useCave } from "../app/context.ts";
import { useFollowing, useNow, useReminderZone, useToday } from "../app/hooks.ts";
import { flowPath, navigate } from "../app/router.ts";
import {
  byDay,
  type CalendarEvent,
  type CalendarSource,
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
import { RoutineToday } from "../ui/RoutineToday.tsx";
import { rowOpen } from "../ui/row-open.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AGENDA_DAYS = 14;

const dayStart = (day: string, timeZone: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return zonedInstant(Date.UTC(y, m - 1, d), timeZone);
};
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

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

export function Calendar({ mode }: { mode: "month" | "agenda" }) {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const sources = useSources();
  const today = useToday();
  const zone = useReminderZone();
  const [month, setMonth] = useFollowing(monthOf(today));
  const [open, setOpen] = useState<{ id: string; collection: string }>();
  const [adding, setAdding] = useState<string>();

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
      : setOpen({ id: e.itemId, collection: e.collection });

  return (
    <>
      <div className={mode === "month" ? "calendar-page" : undefined}>
        {mode === "month" && (
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
              {grid.flat().map((day, i) =>
                day ? (
                  <div key={day} className={`day${day === today ? " today" : ""}`}>
                    <button
                      type="button"
                      className="day-add num muted"
                      aria-label={`New reminder on ${shortDay(day)}`}
                      onClick={() => setAdding(day)}
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
            {adding && <NewReminder day={adding} onDone={() => setAdding(undefined)} />}
          </section>
        )}
        {mode === "agenda" && <RoutineToday />}
        {agenda && <Agenda events={agenda} today={today} color={color} open={show} />}
      </div>
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
}: {
  events: CalendarEvent[];
  today: string;
  color(collection: string): string;
  open(event: CalendarEvent): void;
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
      aria-label="Agenda"
      style={{ padding: 16, display: "grid", gap: 12 }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Next {AGENDA_DAYS} days</h2>
      {overdue.length > 0 && (
        <div>
          <span className="k error">Overdue</span>
          <ul className="agenda-list">{overdue.map(row)}</ul>
        </div>
      )}
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <span className="k">{day === today ? "Today" : `${shortDay(day)}`}</span>
          <ul className="agenda-list">{list.map(row)}</ul>
        </div>
      ))}
      {events.length === 0 && <span className="muted">Nothing due in the next two weeks.</span>}
    </section>
  );
}

function NewReminder({ day, onDone }: { day: string; onDone(): void }) {
  const { local } = useCave();
  const zone = useReminderZone();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState(zone.defaultTime);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await local.write(
      { id: newId(), kind: "item", collection: "reminders" },
      { _title: title.trim(), due: time ? `${day}T${time}` : day, repeat: "none", done: false },
    );
    onDone();
  };

  return (
    <form
      className="new-reminder"
      onSubmit={submit}
      aria-label={`New reminder on ${shortDay(day)}`}
    >
      <span className="k">New reminder · {shortDay(day)}</span>
      <input
        className="input"
        placeholder="Remind me to…"
        aria-label="Reminder"
        // biome-ignore lint/a11y/noAutofocus: the form opens from a click on the day
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="input"
        type="time"
        aria-label="Time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        Add
      </button>
      <button type="button" className="btn" onClick={onDone} aria-label="Cancel">
        <Icon name="x" size={15} />
      </button>
    </form>
  );
}
