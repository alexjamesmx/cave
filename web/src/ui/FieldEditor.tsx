import { type FormEvent, useState } from "react";
import { optionText } from "../../../shared/categories.ts";
import {
  EDITABLE_FIELD_TYPES,
  type Field,
  type FieldType,
  type OptionKind,
  type SelectOption,
} from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { addField, archiveField, restoreField } from "../logic/field-edits.ts";
import type { CollectionDoc } from "../store/queries.ts";
import { hasIcon, Icon } from "./icon.tsx";

const COLORS = [
  "#B6FF3B",
  "#2EE6A6",
  "#FF5C7A",
  "#3DE0FF",
  "#8B7CFF",
  "#F5C451",
  "#FF9F43",
  "#C77DFF",
  "#8C93A0",
];

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

  const saveFields = (next: Field[]) =>
    local.write({ id: collection.id, kind: "collection", collection: null }, { fields: next });
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
            {field.type === "select" && (
              <Options
                options={field.options ?? []}
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

function Options({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange(next: SelectOption[]): void;
}) {
  const [value, setValue] = useState("");
  const set = (i: number, patch: { [K in keyof SelectOption]?: SelectOption[K] | undefined }) =>
    onChange(
      options.map((o, j) => {
        if (i !== j) return o;
        const next = { ...o, ...patch } as Record<string, unknown>;
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
        return next as unknown as SelectOption;
      }),
    );

  return (
    <div style={{ display: "grid", gap: 6, paddingLeft: 8 }}>
      {options.map((o, i) => (
        <div
          key={o.value}
          style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
        >
          <span
            className="chip"
            style={{ background: `${o.color}1f`, color: o.color, minWidth: 96 }}
            title={o.value}
          >
            {!o.emoji && <Icon name={o.icon} size={13} />}
            {optionText(o)}
          </span>
          <input
            key={`emoji-${o.emoji ?? ""}`}
            className="input"
            aria-label={`Emoji for ${o.value}`}
            defaultValue={o.emoji ?? ""}
            style={{ width: 56 }}
            onBlur={(e) => {
              const emoji = e.target.value.trim();
              if (emoji !== (o.emoji ?? "")) set(i, emoji ? { emoji } : { emoji: undefined });
            }}
          />
          <input
            key={`label-${o.label ?? ""}`}
            className="input"
            aria-label={`Name for ${o.value}`}
            defaultValue={o.label ?? ""}
            placeholder={o.value}
            style={{ flex: "1 1 120px", minWidth: 0 }}
            onBlur={(e) => {
              const label = e.target.value.trim();
              if (label !== (o.label ?? "")) set(i, label ? { label } : { label: undefined });
            }}
          />
          <select
            className="input"
            aria-label={`Kind for ${o.value}`}
            value={o.kind ?? ""}
            onChange={(e) =>
              set(i, e.target.value ? { kind: e.target.value as OptionKind } : { kind: undefined })
            }
          >
            <option value="">No kind</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
          <input
            key={o.icon}
            className="input"
            aria-label={`Icon for ${o.value}`}
            defaultValue={o.icon}
            style={{ flex: "1 1 90px", minWidth: 0 }}
            onBlur={(e) => {
              const icon = e.target.value.trim();
              if (icon !== o.icon && hasIcon(icon)) set(i, { icon });
            }}
          />
          <select
            className="input"
            aria-label={`Colour for ${o.value}`}
            value={o.color}
            onChange={(e) => set(i, { color: e.target.value })}
            style={{ color: o.color }}
          >
            {[...new Set([o.color, ...COLORS])].map((c) => (
              <option key={c} value={c} style={{ color: c }}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            aria-label={`Remove option ${o.value}`}
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <form
        style={{ display: "flex", gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v || options.some((o) => o.value === v)) return;
          onChange([...options, { value: v, icon: "tag", color: "#8C93A0" }]);
          setValue("");
        }}
      >
        <input
          className="input"
          aria-label="New option"
          placeholder="New option"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn">
          Add
        </button>
      </form>
    </div>
  );
}
