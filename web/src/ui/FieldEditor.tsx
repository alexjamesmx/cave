import { type FormEvent, useState } from "react";
import { unresolved } from "../../../shared/fields.ts";
import { EDITABLE_FIELD_TYPES, type Field, type FieldType } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { addField, archiveField, restoreField } from "../logic/field-edits.ts";
import type { CollectionDoc } from "../store/queries.ts";
import { Icon } from "./icon.tsx";
import { OptionsEditor } from "./OptionsEditor.tsx";

/**
 * Edits a collection's fields. Field ids and option values are fixed once created: items
 * store them, so changing one would orphan existing data. Names, icons and colours change.
 * Removing a field archives it, so its id is never reused.
 */
export function FieldEditor({
  collection,
  onClose,
}: {
  collection: CollectionDoc;
  onClose(): void;
}) {
  const { local } = useCave();
  const { fields } = collection.data;
  const [error, setError] = useState<string>();

  // Views get shared lists filled in; what is saved is the fields as stored.
  const saveFields = (next: Field[]) =>
    local.write(
      { id: collection.id, kind: "collection", collection: null },
      { fields: unresolved(next) },
    );
  const update = (id: string, change: (f: Field) => Field) =>
    saveFields(fields.map((f) => (f.id === id ? change(f) : f)));

  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const result = addField(fields, name, String(form.get("type")) as FieldType);
    if ("error" in result) return setError(result.error);
    setError(undefined);
    void saveFields(result.fields);
    e.currentTarget.reset();
  };
  const archived = fields.filter((f) => f.archived);

  return (
    <aside className="panel drawer" aria-label="Fields">
      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="k" style={{ flex: 1 }}>
          {collection.data.name} · fields
        </span>
        <button type="button" className="btn" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </div>
      {fields
        .filter((f) => !f.archived)
        .map((field) => (
          <section key={field.id} className="field-card">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                key={field.name}
                className="input"
                aria-label={`Name of ${field.id}`}
                defaultValue={field.name}
                style={{ flex: 1 }}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== field.name) void update(field.id, (f) => ({ ...f, name }));
                }}
              />
              <span className="k">{field.type}</span>
              <button
                type="button"
                className="btn"
                aria-label={`Remove field ${field.name}`}
                onClick={() => {
                  if (
                    confirm(
                      `Remove “${field.name}”? Values stay on the items and it can be restored.`,
                    )
                  ) {
                    void saveFields(archiveField(fields, field.id));
                  }
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            {field.type === "select" && field.config?.optionsFrom && (
              <span className="muted" style={{ fontSize: 13 }}>
                Shares the {field.config.optionsFrom.field} list of{" "}
                {field.config.optionsFrom.collection}; edit it in Settings → Lists.
              </span>
            )}
            {field.type === "select" && !field.config?.optionsFrom && (
              <OptionsEditor
                name={field.name}
                options={field.options ?? []}
                kinds={collection.id === "money" && field.id === "category"}
                onChange={(options) => update(field.id, (f) => ({ ...f, options }))}
              />
            )}
          </section>
        ))}
      {archived.length > 0 && (
        <section className="field-card">
          <span className="k">Removed</span>
          {archived.map((field) => (
            <div key={field.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1 }} className="muted">
                {field.name} <span className="k">{field.type}</span>
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => void saveFields(restoreField(fields, field.id))}
              >
                Restore
              </button>
            </div>
          ))}
        </section>
      )}
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          name="name"
          className="input"
          aria-label="New field name"
          placeholder="New field"
          style={{ flex: 1 }}
        />
        <select name="type" className="input" aria-label="New field type" defaultValue="text">
          {EDITABLE_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Add field
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </aside>
  );
}
