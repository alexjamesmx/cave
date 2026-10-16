import { optionText } from "../../../shared/categories.ts";
import { shortDay } from "../../../shared/dates.ts";
import { isSafeUrl } from "../../../shared/fields.ts";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useDoc, useItems } from "../store/queries.ts";
import { Icon } from "./icon.tsx";

/** A select value as a coloured chip; values no longer offered still show, greyed. */
export function OptionChip({ field, value }: { field: Field; value: unknown }) {
  if (typeof value !== "string" || !value) return <span className="muted">—</span>;
  const option = field.options?.find((o) => o.value === value);
  const color = option?.color ?? "var(--muted)";
  return (
    <span className="chip" style={{ background: `${color}1f`, color }}>
      {option && !option.emoji && <Icon name={option.icon} size={13} />}
      {option ? optionText(option) : value}
    </span>
  );
}

export function FieldValue({ field, value }: { field: Field; value: unknown }) {
  if (value === undefined || value === null || value === "") {
    return <span className="muted">—</span>;
  }
  switch (field.type) {
    case "select":
      return <OptionChip field={field} value={value} />;
    case "money":
      return <span className="num">{typeof value === "number" ? formatMoney(value) : "?"}</span>;
    case "number":
      return <span className="num">{String(value)}</span>;
    case "checkbox":
      return value === true ? <Icon name="check" size={16} color="var(--lime)" /> : null;
    case "date": {
      const text = String(value);
      const time = text.length > 10 ? ` ${text.slice(11, 16)}` : "";
      return <span className="num">{`${shortDay(text)}${time}`}</span>;
    }
    case "json":
      return <span className="muted">Flow definition</span>;
    case "ref":
      return <RefValue id={String(value)} />;
    case "url":
      // Checked again here: a value written before validation, or by an older client, may
      // carry another scheme and must never become a clickable link.
      return isSafeUrl(value) ? (
        <a href={value} target="_blank" rel="noreferrer noopener">
          {value}
        </a>
      ) : (
        <span>{String(value)}</span>
      );
    default:
      return <span>{String(value)}</span>;
  }
}

interface InputProps {
  field: Field;
  value: unknown;
  onChange(value: unknown): void;
  id?: string;
}

type Blur = { target: HTMLInputElement };
// Blur only writes when the text changed, so tabbing through a form never rewrites a value.
const changed = (e: Blur) => e.target.value !== e.target.defaultValue;

/** Where a ref's target opens, when it has a page of its own. */
export const refPath = (doc: Doc) =>
  doc.collection === "projects" ? `/projects/${encodeURIComponent(doc.id)}` : undefined;

/** A ref shows its target's title; a deleted or missing target says so. */
function RefValue({ id }: { id: string }) {
  const doc = useDoc(useCave().local.db, id);
  if (!doc) return <span className="muted">{id}</span>;
  if (doc.data._deleted === true) return <span className="muted">{titleOf(doc)} (deleted)</span>;
  const path = refPath(doc);
  return path ? (
    <a href={path} className="link" onClick={(e) => e.stopPropagation()}>
      {titleOf(doc)}
    </a>
  ) : (
    <span>{titleOf(doc)}</span>
  );
}

/** A ref picks one live item of its target collection. */
function RefInput({ field, value, onChange, id }: InputProps) {
  const options = useItems(useCave().local.db, field.config?.collection ?? "");
  const text = typeof value === "string" ? value : "";
  const sorted = [...(options ?? [])].sort((a, b) =>
    titleOf(a) < titleOf(b) ? -1 : titleOf(a) > titleOf(b) ? 1 : 0,
  );
  return (
    <select
      id={id}
      className="input"
      style={{ width: "100%" }}
      value={text}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {sorted.map((d) => (
        <option key={d.id} value={d.id}>
          {titleOf(d)}
        </option>
      ))}
      {text && options && !options.some((d) => d.id === text) && (
        <option value={text}>{text} (not found)</option>
      )}
    </select>
  );
}

// Empty inputs write null, which clears the field; a typed value is validated on write.
export function FieldInput({ field, value, onChange, id }: InputProps) {
  const text = value === undefined || value === null ? "" : String(value);
  const common = { id, className: "input", style: { width: "100%" } };
  switch (field.type) {
    case "select":
      return (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {optionText(o)}
            </option>
          ))}
          {text && !field.options?.some((o) => o.value === text) && (
            <option value={text}>{text} (not an option)</option>
          )}
        </select>
      );
    case "ref":
      return <RefInput field={field} value={value} onChange={onChange} {...(id ? { id } : {})} />;
    case "json":
      return (
        <a id={id} href="/ai/flows" className="link">
          Edit on the Flows page
        </a>
      );
    case "checkbox":
      return (
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: "var(--lime)" }}
        />
      );
    case "number":
    case "money":
      return (
        // Remount on a new value so a change synced from another device shows up.
        <input
          key={text}
          {...common}
          type="number"
          step="any"
          inputMode="decimal"
          defaultValue={text}
          onBlur={(e) => {
            if (changed(e)) onChange(e.target.value === "" ? null : Number(e.target.value));
          }}
        />
      );
    case "date": {
      // A date-only value in a field with time (imported ledger rows) edits as a date, so
      // it round-trips instead of gaining an invented time.
      const withTime = field.config?.withTime === true && text.length !== 10;
      return (
        <input
          key={text}
          {...common}
          type={withTime ? "datetime-local" : "date"}
          defaultValue={withTime ? text.slice(0, 16) : text.slice(0, 10)}
          onBlur={(e) => {
            if (changed(e)) onChange(e.target.value || null);
          }}
        />
      );
    }
    default:
      return (
        <input
          key={text}
          {...common}
          type={field.type === "url" ? "url" : "text"}
          defaultValue={text}
          onBlur={(e) => {
            if (changed(e)) onChange(e.target.value === "" ? null : e.target.value);
          }}
        />
      );
  }
}
