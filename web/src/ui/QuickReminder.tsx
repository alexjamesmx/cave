import { type FormEvent, type MouseEvent, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone, useToday } from "../app/hooks.ts";
import { todayTime } from "../logic/agenda.ts";
import { addDays, dateLabel } from "../logic/calendar.ts";

type When = "today" | "tomorrow" | "pick";

/** A click anywhere on a date or time chip opens its picker, as its hidden icon would. */
function openPicker(e: MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker();
  } catch {
    // Not every browser lets a click open it; typing still works.
  }
}

/**
 * "Remind me to…": type and press Enter to save a reminder, today at the reminder time (or the
 * next hour once that has passed) unless a chip says otherwise: Tomorrow, a picked day, another
 * time; no time is the whole day. The chips stay as set, so a few reminders for one day go in
 * one after another.
 */
export function QuickReminder() {
  const { local } = useCave();
  const today = useToday();
  const zone = useReminderZone();
  const clock = localDateTime(useNow(), zone.timeZone).slice(11, 16);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<When>("today");
  const [picked, setPicked] = useState("");
  // Unset follows the settings' reminder time, which loads after the first render.
  const [time, setTime] = useState<string>();
  const [error, setError] = useState<string>();
  const at = time ?? (when === "today" ? todayTime(zone.defaultTime, clock) : zone.defaultTime);
  const day = when === "today" ? today : when === "tomorrow" ? addDays(today, 1) : picked;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = title.trim();
    if (!text || !day) return;
    try {
      await local.write(
        { id: newId(), kind: "item", collection: "reminders" },
        { _title: text, due: at ? `${day}T${at}` : day, repeat: "none", done: false },
      );
    } catch (err) {
      if (!(err instanceof FieldValueError)) throw err;
      return setError(err.message);
    }
    setError(undefined);
    setTitle("");
  };

  const chip = (value: When, label: string, emoji?: string) => (
    <button
      type="button"
      className="when-chip"
      aria-pressed={when === value}
      data-emoji={emoji}
      onClick={() => setWhen(value)}
    >
      {label}
    </button>
  );

  return (
    <form
      className={`quick-remind${title ? " typing" : ""}`}
      aria-label="Quick reminder"
      onSubmit={(e) => void submit(e)}
    >
      <label className="quick-remind-input" data-emoji="🔔">
        <input
          aria-label="Remind me to"
          placeholder="Remind me to…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="quick-remind-chips">
        {chip("today", "Today")}
        {chip("tomorrow", "Tomorrow")}
        {when === "pick" ? (
          <label className="when-chip on" data-emoji="📅">
            <input
              type="date"
              // biome-ignore lint/a11y/noAutofocus: Pick opens the day field to choose a day
              autoFocus
              aria-label="Day"
              min={today}
              value={picked}
              onClick={openPicker}
              onChange={(e) => setPicked(e.target.value)}
            />
          </label>
        ) : (
          chip("pick", picked ? dateLabel(picked, today) : "Pick", "📅")
        )}
        <label className="when-chip" data-emoji="⏰">
          <input
            type="time"
            aria-label="Time"
            value={at}
            onClick={openPicker}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>
      {/* Enter in the title saves: a form with several fields needs a submit button for that. */}
      <button type="submit" className="sr" tabIndex={-1}>
        Save reminder
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
