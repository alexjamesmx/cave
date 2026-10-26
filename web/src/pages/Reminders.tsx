import { useMemo, useState } from "react";
import { REPEATS, type Repeat, repeatOf } from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone, useToday } from "../app/hooks.ts";
import { setSearch, useSearch } from "../app/router.ts";
import {
  dayLabel,
  REMINDER_CHIPS,
  type ReminderChip,
  type ReminderQuery,
  reminderList,
  reminderQueryFromSearch,
  reminderQueryToSearch,
} from "../logic/reminder-list.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";
import { ReminderActions } from "../ui/ReminderActions.tsx";
import { REPEAT_LABEL, ReminderSheet } from "../ui/ReminderForm.tsx";
import { rowOpen } from "../ui/row-open.ts";

const CHIP_LABEL: Record<ReminderChip, string> = {
  upcoming: "Upcoming",
  overdue: "Overdue",
  done: "Done",
  all: "All",
};

const timeOf = (due: unknown) =>
  typeof due === "string" && due.length > 10 ? due.slice(11, 16) : "all day";

/**
 * Calendar → Reminders (M13): chips Upcoming, Overdue, Done and All with their counts, a
 * repeat filter and search, rows grouped by day; a row opens the reminder form, Done and
 * Snooze act in place, and New reminder adds one. The query lives in the address.
 */
export function Reminders() {
  const { db } = useCave().local;
  const items = useItems(db, "reminders");
  const zone = useReminderZone();
  const now = useNow().getTime();
  const today = useToday();
  const search = useSearch();
  const q = useMemo(() => reminderQueryFromSearch(search), [search]);
  const [sheet, setSheet] = useState<{ id?: string }>();
  const [message, setMessage] = useState<string>();
  const list = useMemo(() => reminderList(items ?? [], q, now, zone), [items, q, now, zone]);
  if (!items) return null;
  const set = (patch: Partial<ReminderQuery>) =>
    setSearch(reminderQueryToSearch({ ...q, ...patch }));
  const editing = sheet?.id ? items.find((d) => d.id === sheet.id) : undefined;

  const row = (d: Doc) => {
    const repeat = repeatOf(d.data);
    return (
      <tr
        key={d.id}
        className={d.data.done === true ? "done" : undefined}
        {...rowOpen(() => setSheet({ id: d.id }))}
      >
        <td className="num muted reminder-time">{timeOf(d.data.due)}</td>
        <td>
          <button type="button" className="link" onClick={() => setSheet({ id: d.id })}>
            {titleOf(d)}
          </button>
          {repeat !== "none" && (
            <span className="chip repeat-chip">
              <Icon name="repeat" size={11} aria-hidden="true" /> {REPEAT_LABEL[repeat]}
            </span>
          )}
        </td>
        <td style={{ textAlign: "right" }}>
          <ReminderActions doc={d} />
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="ledger-controls">
        <fieldset className="chips">
          <legend className="sr">Show</legend>
          {REMINDER_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="btn"
              aria-pressed={q.chip === c}
              onClick={() => set({ chip: c })}
            >
              {CHIP_LABEL[c]} <span className="num muted">{list.counts[c]}</span>
            </button>
          ))}
        </fieldset>
        <input
          className="input"
          type="search"
          aria-label="Search reminders"
          placeholder="Search"
          value={q.text}
          onChange={(e) => set({ text: e.target.value })}
          style={{ flex: "1 1 140px", minWidth: 0 }}
        />
        <select
          className="input"
          aria-label="Repeat filter"
          value={q.repeat}
          onChange={(e) => set({ repeat: e.target.value as Repeat | "" })}
          style={{ width: "auto" }}
        >
          <option value="">Any repeat</option>
          {REPEATS.map((r) => (
            <option key={r} value={r}>
              {REPEAT_LABEL[r]}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" onClick={() => setSheet({})}>
          <Icon name="plus" size={15} /> New reminder
        </button>
      </div>
      <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
        {message}
      </p>
      <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
        <table className="table reminder-table" aria-label="Reminders">
          <thead>
            <tr>
              <th>Time</th>
              <th>Reminder</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          {/* One body, so a row that moves to another day (Done, Snooze) keeps its Undo. */}
          <tbody>
            {list.groups.flatMap((g) => [
              <tr key={`day-${g.key}`} className="group-row">
                <th colSpan={3} scope="rowgroup">
                  {dayLabel(g.key, today)} <span className="num muted">{g.rows.length}</span>
                </th>
              </tr>,
              ...g.rows.map(row),
            ])}
          </tbody>
        </table>
        <div style={{ padding: 12 }}>
          <span className="num muted" style={{ fontSize: 12 }}>
            {list.total === 0
              ? "Nothing here."
              : `${list.total} reminder${list.total === 1 ? "" : "s"}`}
          </span>
        </div>
      </section>
      {sheet && (!sheet.id || editing) && (
        <ReminderSheet
          key={sheet.id ?? "new"}
          doc={editing}
          day={today}
          onClose={(m) => {
            if (m) setMessage(m);
            setSheet(undefined);
          }}
        />
      )}
    </div>
  );
}
