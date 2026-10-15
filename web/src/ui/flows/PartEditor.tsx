import { useId } from "react";
import { activeFields } from "../../../../shared/fields.ts";
import {
  type Condition,
  type FieldValues,
  type FlowDefinition,
  OPS,
  type ParamSpec,
  STEPS,
  type Step,
  specOf,
  TRIGGERS,
  type Trigger,
} from "../../../../shared/flows/registry.ts";
import type { Field } from "../../../../shared/schema.ts";
import {
  blankPart,
  moveStep,
  removeStep,
  replaceStep,
  type Selection,
  templateTokens,
  triggerCollection,
  withParam,
} from "../../logic/flow-edit.ts";
import type { CollectionDoc } from "../../store/queries.ts";
import { FieldInput } from "../fields.tsx";

interface Props {
  def: FlowDefinition;
  selection: Selection;
  collections: CollectionDoc[];
  onChange(def: FlowDefinition): void;
  onSelect(selection: Selection): void;
}

// Text fields take templates; every other type takes a value through its own input.
const TEMPLATED = new Set(["text", "url"]);
const TITLE: Field = { id: "title", name: "Title", type: "text" };

/** The form for the selected trigger or step, built from the registry's parameter specs. */
export function PartEditor({ def, selection, collections, onChange, onSelect }: Props) {
  const kind = selection === "trigger" ? "trigger" : "step";
  const part: Trigger | Step =
    selection === "trigger" ? def.trigger : (def.steps[selection] as Step);
  const spec = specOf(kind, part.type);
  const fieldsOf = (collection: string | undefined) => {
    const c = collections.find((d) => d.id === collection);
    return c ? activeFields(c.data.fields).filter((f) => f.type !== "json") : [];
  };
  const firstCollection = collections[0]?.id ?? "tasks";
  // Whose fields this part names: its own collection, or the trigger item's.
  const context =
    "collection" in part && typeof part.collection === "string"
      ? part.collection
      : triggerCollection(def);
  const fields = fieldsOf(context);
  const tokens = templateTokens(def, fieldsOf(triggerCollection(def)));

  const put = (next: Trigger | Step) =>
    onChange(
      selection === "trigger"
        ? { ...def, trigger: next as Trigger }
        : replaceStep(def, selection, next as Step),
    );
  const setType = (type: string) =>
    put(
      kind === "trigger"
        ? blankPart("trigger", type, context ?? firstCollection)
        : blankPart("step", type, context ?? firstCollection),
    );
  const value = (key: string) => (part as unknown as Record<string, unknown>)[key];
  const set = (key: string, v: unknown) => put(withParam(part, key, v));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <span className="k" style={{ color: "#cfff7a" }}>
        {kind === "trigger" ? "Trigger" : `Step ${(selection as number) + 1}`}
      </span>
      <Row label="Type">
        {(id) => (
          <select
            id={id}
            className="input"
            value={part.type}
            onChange={(e) => setType(e.target.value)}
          >
            {(kind === "trigger" ? TRIGGERS : STEPS).map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </Row>
      {spec?.params.map((p) => (
        <Param
          key={`${part.type}-${p.key}`}
          spec={p}
          value={value(p.key)}
          onChange={(v) => set(p.key, v)}
          collections={collections}
          fields={fields}
          tokens={tokens}
          valueField={
            p.kind === "value" ? [TITLE, ...fields].find((f) => f.id === value("field")) : undefined
          }
        />
      ))}
      {kind === "step" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => onChange(moveStep(def, selection as number, -1))}
          >
            Move up
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onChange(moveStep(def, selection as number, 1))}
          >
            Move down
          </button>
          <button
            type="button"
            className="btn"
            disabled={def.steps.length <= 1}
            onClick={() => {
              onChange(removeStep(def, selection as number));
              onSelect("trigger");
            }}
          >
            Remove step
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children(id: string): React.ReactNode }) {
  const id = useId();
  return (
    <div className="flow-set">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

interface ParamProps {
  spec: ParamSpec;
  value: unknown;
  onChange(value: unknown): void;
  collections: CollectionDoc[];
  fields: Field[];
  tokens: string[];
  valueField: Field | undefined;
}

function Param({ spec, value, onChange, collections, fields, tokens, valueField }: ParamProps) {
  const label = spec.optional ? `${spec.label} (optional)` : spec.label;
  const text = value === undefined || value === null ? "" : String(value);
  switch (spec.kind) {
    case "collection":
      return (
        <Row label={label}>
          {(id) => (
            <select
              id={id}
              className="input"
              value={text}
              onChange={(e) => onChange(e.target.value)}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.data.name}
                </option>
              ))}
            </select>
          )}
        </Row>
      );
    case "field":
      return (
        <Row label={label}>
          {(id) => <FieldSelect id={id} fields={fields} value={text} onChange={onChange} />}
        </Row>
      );
    case "value":
      return (
        <Row label={label}>
          {(id) => <ValueInput id={id} field={valueField} value={value} onChange={onChange} />}
        </Row>
      );
    case "template":
      return (
        <Row label={label}>
          {(id) => <TemplateInput id={id} value={text} tokens={tokens} onChange={onChange} />}
        </Row>
      );
    case "time":
      return (
        <Row label={label}>
          {(id) => (
            <input
              id={id}
              type="time"
              className="input"
              value={text}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </Row>
      );
    case "int":
      return (
        <Row label={label}>
          {(id) => (
            <input
              id={id}
              type="number"
              className="input"
              min={spec.min}
              max={spec.max}
              value={text}
              onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            />
          )}
        </Row>
      );
    case "enum":
      return (
        <Row label={label}>
          {(id) => (
            <select
              id={id}
              className="input"
              value={text}
              onChange={(e) => onChange(e.target.value)}
            >
              {spec.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </Row>
      );
    case "conditions":
      return (
        <Conditions
          label={label}
          value={(value as Condition[] | undefined) ?? []}
          fields={fields}
          onChange={(all) => onChange(all.length === 0 && spec.optional ? undefined : all)}
        />
      );
    case "fields":
      return (
        <FieldValuesInput
          label={label}
          value={(value as FieldValues | undefined) ?? {}}
          fields={fields}
          tokens={tokens}
          onChange={(v) => onChange(Object.keys(v).length === 0 && spec.optional ? undefined : v)}
        />
      );
  }
}

function FieldSelect({
  id,
  fields,
  value,
  onChange,
  label,
}: {
  id?: string;
  fields: Field[];
  value: string;
  onChange(value: string): void;
  label?: string;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {[TITLE, ...fields].map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
      {value && ![TITLE, ...fields].some((f) => f.id === value) && (
        <option value={value}>{value} (not a field)</option>
      )}
    </select>
  );
}

/**
 * A literal value in the field's own input; free text when the field is unknown. Inside a
 * row it has no visible label, so it carries a hidden one.
 */
function ValueInput({
  id,
  field,
  value,
  onChange,
}: {
  id?: string;
  field: Field | undefined;
  value: unknown;
  onChange(value: unknown): void;
}) {
  const own = useId();
  const inputId = id ?? own;
  const input =
    field && !TEMPLATED.has(field.type) ? (
      <FieldInput id={inputId} field={field} value={value} onChange={onChange} />
    ) : (
      <input
        id={inputId}
        className="input"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (id) return input;
  return (
    <span>
      <label className="sr" htmlFor={inputId}>
        Value
      </label>
      {input}
    </span>
  );
}

function TemplateInput({
  id,
  value,
  tokens,
  onChange,
  label,
}: {
  id?: string;
  value: string;
  tokens: string[];
  onChange(value: string): void;
  label?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        id={id}
        aria-label={label}
        className="input"
        style={{ flex: 1 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <select
        className="input"
        aria-label="Insert a value"
        value=""
        style={{ width: 44 }}
        onChange={(e) => e.target.value && onChange(`${value}{{${e.target.value}}}`)}
      >
        <option value="">{"{}"}</option>
        {tokens.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

function Conditions({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: Condition[];
  fields: Field[];
  onChange(value: Condition[]): void;
}) {
  const put = (i: number, c: Condition) => onChange(value.map((v, j) => (j === i ? c : v)));
  return (
    <fieldset className="flow-set">
      <legend>{label}</legend>
      {value.map((c, i) => {
        const field = [TITLE, ...fields].find((f) => f.id === c.field);
        const needsValue = c.op !== "empty" && c.op !== "not-empty";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: conditions are identified by position
          <div key={i} className="flow-row">
            <FieldSelect
              label="Field"
              fields={fields}
              value={c.field}
              onChange={(f) => put(i, { field: f, op: c.op })}
            />
            <select
              aria-label="Operator"
              className="input"
              value={c.op}
              onChange={(e) => {
                const op = e.target.value as Condition["op"];
                const { value: _old, ...rest } = c;
                put(i, op === "empty" || op === "not-empty" ? { ...rest, op } : { ...c, op });
              }}
            >
              {OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            {needsValue && (
              <ValueInput
                field={field}
                value={c.value}
                onChange={(v) =>
                  put(i, { ...c, value: (v ?? null) as NonNullable<Condition["value"]> | null })
                }
              />
            )}
            <button
              type="button"
              className="btn"
              aria-label="Remove condition"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="btn"
        onClick={() => onChange([...value, { field: "title", op: "not-empty" }])}
      >
        Add a condition
      </button>
    </fieldset>
  );
}

function FieldValuesInput({
  label,
  value,
  fields,
  tokens,
  onChange,
}: {
  label: string;
  value: FieldValues;
  fields: Field[];
  tokens: string[];
  onChange(value: FieldValues): void;
}) {
  const entries = Object.entries(value);
  const unused = fields.filter((f) => !(f.id in value));
  const rename = (from: string, to: string) =>
    onChange(Object.fromEntries(entries.map(([k, v]) => (k === from ? [to, null] : [k, v]))));
  return (
    <fieldset className="flow-set">
      <legend>{label}</legend>
      {entries.map(([key, v]) => {
        const field = fields.find((f) => f.id === key);
        return (
          <div key={key} className="flow-row">
            <select
              aria-label="Field"
              className="input"
              value={key}
              onChange={(e) => rename(key, e.target.value)}
            >
              {[...(field ? [field] : [{ id: key, name: `${key} (not a field)` }]), ...unused].map(
                (f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ),
              )}
            </select>
            {field && !TEMPLATED.has(field.type) ? (
              <ValueInput
                field={field}
                value={v}
                onChange={(next) => onChange({ ...value, [key]: next as FieldValues[string] })}
              />
            ) : (
              <TemplateInput
                label="Value"
                value={v === null ? "" : String(v)}
                tokens={tokens}
                onChange={(next) => onChange({ ...value, [key]: next })}
              />
            )}
            <button
              type="button"
              className="btn"
              aria-label={`Remove ${key}`}
              onClick={() => onChange(Object.fromEntries(entries.filter(([k]) => k !== key)))}
            >
              ×
            </button>
          </div>
        );
      })}
      {unused.length > 0 && (
        <button
          type="button"
          className="btn"
          onClick={() => onChange({ ...value, [(unused[0] as Field).id]: null })}
        >
          Add a field
        </button>
      )}
    </fieldset>
  );
}
