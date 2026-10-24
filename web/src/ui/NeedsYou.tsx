import { type ReactNode, useMemo, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { parseDefinition } from "../../../shared/flows/registry.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { PAYMENTS } from "../../../shared/payments.ts";
import { isLive, openQuestions } from "../../../shared/project-status.ts";
import { PARTS } from "../../../shared/projects.ts";
import { repeatOf, type Zone, zonedInstant } from "../../../shared/reminders.ts";
import { completeTask } from "../../../shared/tasks.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone, useToday } from "../app/hooks.ts";
import { flowPath, projectPath } from "../app/router.ts";
import {
  type CalendarEvent,
  mergeEvents,
  paymentSource,
  reminderSource,
  taskSource,
} from "../logic/calendar.ts";
import { titleOf } from "../logic/views.ts";
import { type CollectionDoc, useItems } from "../store/queries.ts";
import { DocDrawer } from "./DocDrawer.tsx";
import { ApproveButtons } from "./flows/PendingFlows.tsx";
import { Icon } from "./icon.tsx";
import { ReminderActions } from "./ReminderActions.tsx";
import { rowOpen } from "./row-open.ts";

const nextDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/**
 * "Needs you" (M11 part 4): what only the owner can do, each item a link to where it is
 * handled: questions agents asked, blocked parts, flows waiting for approval, and what is due
 * (overdue, today, tomorrow: reminders, tasks and payments, with their actions).
 */
export function NeedsYou({ collections }: { collections: CollectionDoc[] }) {
  const { db } = useCave().local;
  const tasks = useItems(db, "tasks");
  const parts = useItems(db, PARTS);
  const projects = useItems(db, "projects");
  const flows = useItems(db, FLOWS);
  const zone = useReminderZone();
  const [open, setOpen] = useState<{ id: string; collection: string }>();

  const questions = openQuestions(tasks ?? []);
  const projectTitle = (id: unknown) => {
    const p = projects?.find((x) => x.id === id);
    return p ? titleOf(p) : "";
  };
  const blocked = (parts ?? []).filter((p) => isLive(p) && p.data.status === "blocked");
  const pending = (flows ?? []).filter((f) => isLive(f) && f.data.status === "pending-approval");
  const tomorrow = nextDay(useToday());

  return (
    <section className="panel due-card" aria-label="Needs you">
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="hand" size={16} color="var(--warn)" />
        <span className="k" style={{ flex: 1 }}>
          Needs you
        </span>
        <a href="/calendar" className="link" style={{ fontSize: 13 }}>
          Calendar
        </a>
      </header>
      {questions.length > 0 && (
        <Group label="Questions from agents" name="Questions">
          {questions.map((t) => (
            <li
              key={t.id}
              className="agenda-row"
              {...rowOpen(() => setOpen({ id: t.id, collection: "tasks" }))}
            >
              <span className="mark" style={{ background: "var(--wait)" }} />
              <span className="num muted agenda-time">{String(t.data._askedBy)}</span>
              <button
                type="button"
                className="link"
                onClick={() => setOpen({ id: t.id, collection: "tasks" })}
              >
                {titleOf(t)}
              </button>
              {projectTitle(t.data.project) && (
                <a className="chip" href={projectPath(String(t.data.project))}>
                  {projectTitle(t.data.project)}
                </a>
              )}
              <TaskActions doc={t} zone={zone} tomorrow={tomorrow} />
            </li>
          ))}
        </Group>
      )}
      {blocked.length > 0 && (
        <Group label="Blocked" name="Blocked">
          {blocked.map((p) => (
            <li key={p.id} className="agenda-row">
              <span className="mark" style={{ background: "var(--bad)" }} />
              <a className="link" href={projectPath(String(p.data.project))}>
                {titleOf(p)}
              </a>
              <span className="muted">{projectTitle(p.data.project)}</span>
            </li>
          ))}
        </Group>
      )}
      {pending.length > 0 && (
        <Group label="Flows waiting for approval" name="Flows waiting">
          {pending.map((f) => {
            const parsed = parseDefinition(f.data.definition);
            return (
              <li key={f.id} className="agenda-row">
                <span className="mark" style={{ background: "var(--warn)" }} />
                <a className="link" href={flowPath(f.id)}>
                  {titleOf(f)}
                </a>
                <span className="muted">
                  {String(f.data.author ?? "")}
                  {parsed.ok ? "" : " · invalid definition"}
                </span>
                <span className="reminder-actions">
                  <ApproveButtons flow={f} />
                </span>
              </li>
            );
          })}
        </Group>
      )}
      <Due collections={collections} onOpen={setOpen} />
      {open && (
        <DocDrawer id={open.id} collection={open.collection} onClose={() => setOpen(undefined)} />
      )}
    </section>
  );
}

function Group({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return (
    <div>
      <span className="k">{label}</span>
      <ul className="agenda-list" aria-label={name}>
        {children}
      </ul>
    </div>
  );
}

/** Overdue, today's and tomorrow's reminders, tasks and payments, each with its actions. */
function Due({
  collections,
  onOpen,
}: {
  collections: CollectionDoc[];
  onOpen(target: { id: string; collection: string }): void;
}) {
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

  return (
    <section aria-label="Due" style={{ display: "grid", gap: 12 }}>
      {events.length === 0 && <span className="muted">Nothing due today or tomorrow.</span>}
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([label, list]) => (
          <div key={label}>
            <span className={`k${label === "Overdue" ? " error" : ""}`}>{label}</span>
            <ul className="agenda-list">
              {list.map((e) => {
                const item = doc(e);
                const target = { id: e.itemId, collection: e.collection };
                return (
                  <li
                    key={e.key}
                    className={`agenda-row${e.overdue ? " overdue" : ""}`}
                    {...rowOpen(() => onOpen(target))}
                  >
                    <span className="mark" style={{ background: color(e.collection) }} />
                    <span className="num muted agenda-time">
                      {e.day === today || e.day === tomorrow ? (e.time ?? "") : e.day.slice(5)}
                      {e.day !== today && e.day !== tomorrow && e.time ? ` ${e.time}` : ""}
                    </span>
                    <button type="button" className="link" onClick={() => onOpen(target)}>
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
