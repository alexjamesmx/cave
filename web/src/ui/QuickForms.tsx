import { type FormEvent, type ReactNode, useId, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { preview, type WhenContext } from "../../../shared/when.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone, useTimeZone } from "../app/hooks.ts";
import { parseWhen } from "../logic/when-field.ts";
import type { CollectionDoc } from "../store/queries.ts";

export type QuickKind = "expense" | "task" | "reminder";

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

/** An expense or income on any day; part 5 grows it into the full money form. */
export function ExpenseForm({ collections, onDone }: FormProps) {
  const timeZone = useTimeZone();
  const { write, error } = useWrite();
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => localDateTime(new Date(), timeZone));
  const categories =
    collections
      .find((c) => c.id === "money")
      ?.data.fields.find((f) => f.id === "category")
      ?.options?.map((o) => o.value) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return;
    const saved = await write("money", {
      _title: title.trim(),
      amount: value,
      direction,
      date,
      ...(category ? { category } : {}),
    });
    if (saved) onDone(`Saved · ${direction === "income" ? "Income" : "Expense"} · ${title.trim()}`);
  };

  return (
    <Shell
      label={direction === "income" ? "Income" : "Expense"}
      error={error}
      onSubmit={(e) => void submit(e)}
    >
      <fieldset className="quick-row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr">Direction</legend>
        {(["expense", "income"] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={`btn${direction === d ? " primary" : ""}`}
            aria-pressed={direction === d}
            onClick={() => setDirection(d)}
          >
            {d === "expense" ? "Expense" : "Income"}
          </button>
        ))}
      </fieldset>
      <div className="quick-row">
        <Field label="Amount">
          {(id) => (
            <input
              id={id}
              className="input"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Title">
          {(id) => (
            <input
              id={id}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="quick-row">
        <Field label="Category">
          {(id) => (
            <select
              id={id}
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="When">
          {(id) => (
            <input
              id={id}
              className="input"
              type="datetime-local"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
      </div>
      <button type="submit" className="btn primary" disabled={!(Number(amount) > 0)}>
        Save
      </button>
    </Shell>
  );
}

export function TaskForm({ onDone }: FormProps) {
  const { write, error } = useWrite();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const saved = await write("tasks", {
      _title: title.trim(),
      status: "todo",
      ...(due ? { due } : {}),
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
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          )}
        </Field>
      </div>
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
