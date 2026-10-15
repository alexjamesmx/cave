import { useState } from "react";
import { localDate } from "../../../shared/dates.ts";
import { complete, snooze, snoozeTo } from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone } from "../app/hooks.ts";
import { Icon } from "./icon.tsx";

type Patch = Record<string, unknown>;

/**
 * Done and Snooze for one reminder. Each is an ordinary stamped write, so it syncs and shows
 * in the history; Undo right after puts the previous values back the same way.
 */
export function ReminderActions({ doc }: { doc: Doc }) {
  const { local } = useCave();
  const zone = useReminderZone();
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState("");
  const [undo, setUndo] = useState<{ label: string; before: Patch }>();

  const write = async (patch: Patch, label: string) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, doc.data[k] ?? null]));
    await local.write({ id: doc.id, kind: "item", collection: "reminders" }, patch);
    setMenu(false);
    setUndo({ label, before });
  };
  const now = () => Date.now();
  const tomorrow = () => {
    const day = localDate(new Date(now() + 24 * 60 * 60 * 1000), zone.timeZone);
    return `${day}T${zone.defaultTime}`;
  };

  if (undo) {
    return (
      <span className="reminder-actions">
        <span className="muted">{undo.label}</span>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void local
              .write({ id: doc.id, kind: "item", collection: "reminders" }, undo.before)
              .then(() => setUndo(undefined))
          }
        >
          <Icon name="undo-2" size={14} />
          Undo
        </button>
      </span>
    );
  }
  if (doc.data.done === true) return null;

  return (
    <span className="reminder-actions">
      <button
        type="button"
        className="btn"
        onClick={() => void write(complete(doc, now(), zone), "Done")}
      >
        <Icon name="check" size={14} />
        Done
      </button>
      <button type="button" className="btn" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        <Icon name="alarm-clock" size={14} />
        Snooze
      </button>
      {menu && (
        <span className="snooze-menu">
          <button
            type="button"
            className="btn"
            onClick={() => void write(snooze(doc, 10, now(), zone.timeZone), "Snoozed 10 min")}
          >
            10 min
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void write(snooze(doc, 60, now(), zone.timeZone), "Snoozed 1 hour")}
          >
            1 hour
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void write(snoozeTo(doc, tomorrow()), "Snoozed to tomorrow")}
          >
            Tomorrow {zone.defaultTime}
          </button>
          <form
            style={{ display: "contents" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (custom) void write(snoozeTo(doc, custom), "Snoozed");
            }}
          >
            <input
              type="datetime-local"
              className="input"
              aria-label="Snooze until"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button type="submit" className="btn" disabled={!custom}>
              Set
            </button>
          </form>
        </span>
      )}
    </span>
  );
}
