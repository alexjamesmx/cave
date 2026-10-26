import { type FormEvent, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { complete, REPEATS, type Repeat, repeatOf } from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone, useToday } from "../app/hooks.ts";
import { titleOf } from "../logic/views.ts";
import { Icon } from "./icon.tsx";
import { Sheet } from "./Sheet.tsx";

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Once",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

const REMINDERS = "reminders";
const dateOf = (due: unknown) => (typeof due === "string" ? due.slice(0, 10) : "");
const timeOf = (due: unknown) => (typeof due === "string" ? due.slice(11, 16) : "");

/**
 * One reminder, new or existing: Title, Date, Time (empty for the whole day) and Repeat.
 * An existing one adds Done (a repeating one moves to its next date) and Delete (soft).
 */
export function ReminderForm({
  doc,
  day,
  onDone,
}: {
  doc?: Doc | undefined;
  /** The date a new reminder starts on; today when absent. */
  day?: string | undefined;
  onDone(message: string): void;
}) {
  const { local } = useCave();
  const zone = useReminderZone();
  const today = useToday();
  const [title, setTitle] = useState(doc ? titleOf(doc) : "");
  const [date, setDate] = useState(doc ? dateOf(doc.data.due) || today : (day ?? today));
  const [time, setTime] = useState(doc ? timeOf(doc.data.due) : zone.defaultTime);
  const [repeat, setRepeat] = useState<Repeat>(doc ? repeatOf(doc.data) : "none");
  const [error, setError] = useState<string>();
  const ref = { id: doc?.id ?? newId(), kind: "item" as const, collection: REMINDERS };

  const write = async (patch: Record<string, unknown>, message: string) => {
    try {
      await local.write(ref, patch);
      onDone(message);
    } catch (e) {
      if (!(e instanceof FieldValueError)) throw e;
      setError(e.message);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    void write(
      {
        _title: title.trim(),
        due: time ? `${date}T${time}` : date,
        repeat,
        ...(doc ? {} : { done: false }),
      },
      `Saved · Reminder · ${title.trim()}`,
    );
  };
  const remove = () => {
    if (doc && confirm(`Delete “${titleOf(doc)}”? It stays in the history and can be restored.`))
      void write({ _deleted: true }, `Deleted · Reminder · ${titleOf(doc)}`);
  };

  return (
    <form className="quick-form" aria-label="Reminder" onSubmit={submit}>
      <label className="quick-field">
        <span className="k">Title</span>
        <input
          className="input"
          required
          // biome-ignore lint/a11y/noAutofocus: the form opens to type
          autoFocus={!doc}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="quick-row">
        <label className="quick-field">
          <span className="k">Date</span>
          <input
            className="input"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="quick-field">
          <span className="k">Time</span>
          <input
            className="input"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="quick-field">
          <span className="k">Repeat</span>
          <select
            className="input"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as Repeat)}
          >
            {REPEATS.map((r) => (
              <option key={r} value={r}>
                {REPEAT_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={!title.trim() || !date}>
          Save
        </button>
        {doc && doc.data.done !== true && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              void write(complete(doc, Date.now(), zone), `Done · Reminder · ${titleOf(doc)}`)
            }
          >
            <Icon name="check" size={14} /> Done
          </button>
        )}
        {doc && (
          <button type="button" className="btn danger-text" onClick={remove}>
            <Icon name="trash" size={14} /> Delete
          </button>
        )}
      </div>
    </form>
  );
}

/** The reminder form in a sheet, from any calendar view or the reminders table. */
export function ReminderSheet({
  doc,
  day,
  onClose,
}: {
  doc?: Doc | undefined;
  day?: string | undefined;
  onClose(message?: string): void;
}) {
  return (
    <Sheet title={doc ? "Reminder" : "New reminder"} onClose={() => onClose()}>
      <ReminderForm doc={doc} day={day} onDone={onClose} />
    </Sheet>
  );
}
