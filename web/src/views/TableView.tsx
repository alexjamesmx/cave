import { useMemo, useState } from "react";
import { applyFilter, defaultSort, readFilter, titleOf } from "../logic/views.ts";
import { FieldValue } from "../ui/fields.tsx";
import { ReminderActions } from "../ui/ReminderActions.tsx";
import { NewItem } from "./NewItem.tsx";
import type { ViewProps } from "./types.ts";

// Large collections (the ledger) render in pages so the DOM stays small.
const PAGE = 200;

export function TableView({ collection, view, items, open, preset }: ViewProps) {
  const { fields } = collection.data;
  const [shown, setShown] = useState(PAGE);
  const reminders = collection.id === "reminders";
  const rows = useMemo(
    () => defaultSort(applyFilter(items, readFilter(view.config)), fields),
    [items, view.config, fields],
  );

  return (
    <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            {fields.map((f) => (
              <th key={f.id}>{f.name}</th>
            ))}
            {reminders && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, shown).map((doc) => (
            <tr key={doc.id}>
              <td>
                <button type="button" className="link" onClick={() => open(doc.id)}>
                  {titleOf(doc)}
                </button>
              </td>
              {fields.map((f) => (
                <td key={f.id}>
                  <FieldValue field={f} value={doc.data[f.id]} />
                </td>
              ))}
              {reminders && (
                <td>
                  <ReminderActions doc={doc} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <span className="num muted" style={{ fontSize: 12 }}>
          {Math.min(shown, rows.length)} of {rows.length}
          {rows.length > shown && (
            <button type="button" className="link" onClick={() => setShown(shown + PAGE)}>
              {" "}
              · show more
            </button>
          )}
        </span>
        <NewItem
          collection={collection.id}
          {...(preset ? { preset } : {})}
          placeholder="New row"
          onCreated={open}
        />
      </div>
    </section>
  );
}
