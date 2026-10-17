import { useEffect, useState } from "react";
import { fieldsOf } from "../../../shared/fields.ts";
import type { Change } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useSaver } from "../app/hooks.ts";
import { ownerGet } from "../app/owner-api.ts";
import { titleOf } from "../logic/views.ts";
import { useLive } from "../store/live.ts";
import { type CollectionDoc, useDoc } from "../store/queries.ts";
import { FieldInput, FieldValue } from "./fields.tsx";
import { Icon } from "./icon.tsx";
import { ReminderActions } from "./ReminderActions.tsx";

interface Props {
  collection: CollectionDoc;
  id: string;
  onClose(): void;
}

/** Title, fields and Markdown body of one item, each saved when it loses focus. */
export function ItemDrawer({ collection, id, onClose }: Props) {
  const { db } = useCave().local;
  const doc = useDoc(db, id);
  const refusal = useLive(() => db.rejected.get(id), [db, id]);
  const saver = useSaver(collection.id);
  // Archived fields aren't edited, but a value an item still holds is shown read-only.
  const stored = useDoc(db, collection.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!doc) return null;
  const body = typeof doc.data._body === "string" ? doc.data._body : "";
  const save = (key: string, value: unknown) => {
    if (doc.data[key] !== value) void saver.save(id, { [key]: value });
  };
  const remove = () => {
    if (confirm(`Delete “${titleOf(doc)}”? It stays in the history and can be restored.`)) {
      void saver.save(id, { _deleted: true }).then((ok) => ok && onClose());
    }
  };

  return (
    <aside className="panel drawer" aria-label={`${collection.data.name} item`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="k" style={{ flex: 1 }}>
          {collection.data.name}
        </span>
        <button type="button" className="btn" onClick={remove} aria-label="Delete">
          <Icon name="trash" size={15} />
        </button>
        <button type="button" className="btn" onClick={onClose} aria-label="Close">
          <Icon name="x" size={15} />
        </button>
      </div>
      <input
        key={`title-${String(doc.data._title)}`}
        className="input title-input"
        aria-label="Title"
        defaultValue={typeof doc.data._title === "string" ? doc.data._title : ""}
        placeholder="Untitled"
        onBlur={(e) => {
          if (e.target.value !== (doc.data._title ?? "")) save("_title", e.target.value);
        }}
      />
      {saver.error && (
        <p role="alert" className="error">
          {saver.error}
        </p>
      )}
      {refusal && (
        <p role="alert" className="error">
          Not synced: the server refused {refusal.error}. Fix the value to sync it.
        </p>
      )}
      {collection.id === "reminders" && <ReminderActions doc={doc} />}
      <dl className="field-grid">
        {collection.data.fields.map((field) => (
          <div key={field.id} style={{ display: "contents" }}>
            <dt>
              <label htmlFor={`f-${field.id}`}>{field.name}</label>
            </dt>
            <dd>
              <FieldInput
                id={`f-${field.id}`}
                field={field}
                value={doc.data[field.id]}
                onChange={(value) => save(field.id, value)}
              />
            </dd>
          </div>
        ))}
        {fieldsOf(stored)
          .filter(
            (f) => f.archived === true && doc.data[f.id] !== undefined && doc.data[f.id] !== "",
          )
          .map((field) => (
            <div key={field.id} style={{ display: "contents" }}>
              <dt className="muted">Old {field.name.toLowerCase()}</dt>
              <dd>
                <FieldValue field={field} value={doc.data[field.id]} />
              </dd>
            </div>
          ))}
      </dl>
      <label className="k" htmlFor="item-body">
        Notes · Markdown
      </label>
      <textarea
        key={`body-${body}`}
        id="item-body"
        className="input"
        rows={8}
        defaultValue={body}
        onBlur={(e) => {
          if (e.target.value !== body) save("_body", e.target.value);
        }}
      />
      <History id={id} />
    </aside>
  );
}

function History({ id }: { id: string }) {
  const [changes, setChanges] = useState<Change[] | "offline">();
  useEffect(() => {
    let live = true;
    void ownerGet<{ changes: Change[] }>(`/api/history/${encodeURIComponent(id)}`).then(
      (body) => live && setChanges(body?.changes ?? "offline"),
    );
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <section style={{ display: "grid", gap: 6 }}>
      <span className="k">History</span>
      {changes === "offline" && <span className="muted">History needs the server.</span>}
      {Array.isArray(changes) && changes.length === 0 && (
        <span className="muted">Not synced yet.</span>
      )}
      {Array.isArray(changes) &&
        changes.map((c) => (
          <div key={c.seq} className="num muted" style={{ fontSize: 12 }}>
            {new Date(c.at).toLocaleString()} · {c.actor} · {c.keys.join(", ")}
          </div>
        ))}
    </section>
  );
}
