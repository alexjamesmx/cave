import { type FormEvent, type ReactNode, useId, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { REPEATS } from "../../../shared/recurrence.ts";
import { preview, type WhenContext } from "../../../shared/when.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone, useTimeZone } from "../app/hooks.ts";
import { parseWhen } from "../logic/when-field.ts";
import type { CollectionDoc } from "../store/queries.ts";

export type QuickKind = "expense" | "task" | "reminder" | "payment" | "note";

interface FormProps {
  collections: CollectionDoc[];
  onDone(message: string): void;
}

const item = (collection: string) => ({ id: newId(), kind: "item" as const, collection });

/** Saves through the local store; a value the fields refuse shows instead of throwing. */
function useWrite() {
  const { local } = useCave();
  const [error, setError] = useState<string>();
  const write = async (collection: string, patch: Record<string, unknown>) => {
    try {
      await local.write(item(collection), patch);
      setError(undefined);
      return true;
    } catch (e) {
      if (!(e instanceof FieldValueError)) throw e;
      setError(e.message);
      return false;
    }
  };
  return { write, error };
}

function Shell({
  label,
  error,
  onSubmit,
  children,
}: {
  label: string;
  error: string | undefined;
  onSubmit(e: FormEvent): void;
  children: ReactNode;
}) {
  return (
    <form className="panel quick-form" aria-label={label} onSubmit={onSubmit}>
      {children}
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children(id: string): ReactNode }) {
  const id = useId();
  return (
    <div className="quick-field">
      <label className="k" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export function TaskForm({ onDone }: FormProps) {
  const { write, error } = useWrite();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [repeat, setRepeat] = useState<string>("none");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const saved = await write("tasks", {
      _title: title.trim(),
      status: "todo",
      ...(due ? { due } : {}),
      ...(repeat !== "none" ? { repeat } : {}),
    });
    if (saved) onDone(`Saved · Task · ${title.trim()}`);
  };
  return (
    <Shell label="Task" error={error} onSubmit={(e) => void submit(e)}>
      <div className="quick-row">
        <Field label="Title">
          {(id) => (
            <input
              id={id}
              className="input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field label="Due (optional)">
          {(id) => (
            <input
              id={id}
              className="input"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          )}
        </Field>
        <Field label="Repeat">
          {(id) => (
            <select
              id={id}
              className="input"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            >
              {REPEATS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {repeat !== "none" && (
        <span className="muted" style={{ fontSize: 13 }}>
          Done moves this same task to its next date; it never piles up copies.
        </span>
      )}
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        Save
      </button>
    </Shell>
  );
}

export function ReminderForm({ onDone }: FormProps) {
  const { write, error } = useWrite();
  const zone = useReminderZone();
  const minute = useNow();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const ctx = (now: Date): WhenContext => ({
    now,
    timeZone: zone.timeZone,
    reminderTime: zone.defaultTime,
  });
  const parsed = parseWhen(when, ctx(minute));
  const shown = parsed.ok
    ? preview({ ...parsed, title: title.trim() || "…" }, ctx(minute))
    : when.trim()
      ? parsed.hint
      : "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const now = parseWhen(when, ctx(new Date()));
    if (!title.trim() || !now.ok) return;
    const saved = await write("reminders", {
      _title: title.trim(),
      due: now.due,
      repeat: now.repeat,
      done: false,
    });
    if (saved) onDone(`Saved · ${preview({ ...now, title: title.trim() }, ctx(new Date()))}`);
  };

  return (
    <Shell label="Reminder" error={error} onSubmit={(e) => void submit(e)}>
      <div className="quick-row">
        <Field label="Title">
          {(id) => (
            <input
              id={id}
              className="input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field label="When">
          {(id) => (
            <input
              id={id}
              className="input"
              placeholder="tomorrow 9am · cada mes 22 9:00"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          )}
        </Field>
      </div>
      <p className="muted" aria-live="polite" style={{ margin: 0, minHeight: 20 }}>
        {shown}
      </p>
      <button type="submit" className="btn primary" disabled={!title.trim() || !parsed.ok}>
        Save
      </button>
    </Shell>
  );
}
