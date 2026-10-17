import { useMemo, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { PAYMENTS } from "../../../shared/payments.ts";
import { repeatOf, type Zone, zonedInstant } from "../../../shared/reminders.ts";
import { completeTask } from "../../../shared/tasks.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone, useToday } from "../app/hooks.ts";
import {
  type CalendarEvent,
  mergeEvents,
  paymentSource,
  reminderSource,
  taskSource,
} from "../logic/calendar.ts";
import { type CollectionDoc, useItems } from "../store/queries.ts";
import { DocDrawer } from "./DocDrawer.tsx";
import { Icon } from "./icon.tsx";
import { ReminderActions } from "./ReminderActions.tsx";
import { rowOpen } from "./row-open.ts";

const nextDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** Overdue, today's and tomorrow's reminders, tasks and payments, each with its actions. */
export function DueCard({ collections }: { collections: CollectionDoc[] }) {
  const { db } = useCave().local;
  const reminders = useItems(db, "reminders");
  const tasks = useItems(db, "tasks");
  const payments = useItems(db, PAYMENTS);
  const zone = useReminderZone();
  const now = useNow().getTime();
  const today = useToday();
  const tomorrow = nextDay(today);

  const events = useMemo(() => {
    if (!reminders || !tasks || !payments) return [];
    const [y, m, d] = nextDay(tomorrow).split("-").map(Number) as [number, number, number];
    const range = { from: 0, to: zonedInstant(Date.UTC(y, m - 1, d), zone.timeZone) };
    const sources = [
      reminderSource(reminders, zone, now),
      taskSource(tasks, zone, today),
      paymentSource(payments, zone, now),
    ];
    return mergeEvents(sources, range).filter((e) => !e.repeat && !e.done);
  }, [reminders, tasks, payments, zone, now, today, tomorrow]);

  const groups: [string, CalendarEvent[]][] = [
    ["Overdue", events.filter((e) => e.overdue)],
    ["Today", events.filter((e) => !e.overdue && e.day === today)],
    ["Tomorrow", events.filter((e) => !e.overdue && e.day === tomorrow)],
  ];
  const doc = (e: CalendarEvent) =>
    (e.collection === "reminders" ? reminders : tasks)?.find((d) => d.id === e.itemId);
  const color = (id: string) => collections.find((c) => c.id === id)?.data.color;
  const [open, setOpen] = useState<CalendarEvent>();

  return (
    <section className="panel due-card" aria-label="Due">
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="bell" size={16} color="var(--expense)" />
        <span className="k" style={{ flex: 1 }}>
          Due
        </span>
        <a href="/calendar" className="link" style={{ fontSize: 13 }}>
          Calendar
        </a>
      </header>
      {events.length === 0 && <span className="muted">Nothing due today or tomorrow.</span>}
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([label, list]) => (
          <div key={label}>
            <span className={`k${label === "Overdue" ? " error" : ""}`}>{label}</span>
            <ul className="agenda-list">
              {list.map((e) => {
                const item = doc(e);
                return (
                  <li
                    key={e.key}
                    className={`agenda-row${e.overdue ? " overdue" : ""}`}
                    {...rowOpen(() => setOpen(e))}
                  >
                    <span className="mark" style={{ background: color(e.collection) }} />
                    <span className="num muted agenda-time">
                      {e.day === today || e.day === tomorrow ? (e.time ?? "") : e.day.slice(5)}
                      {e.day !== today && e.day !== tomorrow && e.time ? ` ${e.time}` : ""}
                    </span>
                    <button type="button" className="link" onClick={() => setOpen(e)}>
                      {e.title}
                    </button>
                    {item && e.collection === "reminders" && <ReminderActions doc={item} />}
                    {item && e.collection === "tasks" && (
                      <TaskActions doc={item} zone={zone} tomorrow={tomorrow} />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      {open && (
        <DocDrawer
          id={open.itemId}
          collection={open.collection}
          onClose={() => setOpen(undefined)}
        />
      )}
    </section>
  );
}

/** Done closes the task; Snooze moves its due day to tomorrow. Both can be undone at once. */
function TaskActions({ doc, zone, tomorrow }: { doc: Doc; zone: Zone; tomorrow: string }) {
  const { timeZone } = zone;
  const { local } = useCave();
  const [undo, setUndo] = useState<{ label: string; before: Record<string, unknown> }>();
  const target = { id: doc.id, kind: "item" as const, collection: "tasks" };
  const write = async (patch: Record<string, unknown>, label: string) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, doc.data[k] ?? null]));
    await local.write(target, patch);
    setUndo({ label, before });
  };

  if (undo) {
    return (
      <span className="reminder-actions">
        <span className="muted">{undo.label}</span>
        <button
          type="button"
          className="btn"
          onClick={() => void local.write(target, undo.before).then(() => setUndo(undefined))}
        >
          <Icon name="undo-2" size={14} />
          Undo
        </button>
      </span>
    );
  }
  return (
    <span className="reminder-actions">
      <button
        type="button"
        className="btn"
        onClick={() =>
          void write(
            completeTask(doc, Date.now(), zone, localDateTime(new Date(), timeZone)),
            repeatOf(doc.data) === "none" ? "Done" : "Done · next date set",
          )
        }
      >
        <Icon name="check" size={14} />
        Done
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const due = String(doc.data.due ?? "").slice(0, 10);
          const day = due >= tomorrow ? nextDay(due) : tomorrow;
          void write({ due: day }, `Moved to ${day === tomorrow ? "tomorrow" : day}`);
        }}
      >
        <Icon name="alarm-clock" size={14} />
        Snooze
      </button>
    </span>
  );
}
