import { shortDay } from "../../../shared/dates.ts";
import { isSafeUrl } from "../../../shared/fields.ts";
import type { Field } from "../../../shared/schema.ts";
import { formatMoney } from "../logic/format.ts";
import { Icon } from "./icon.tsx";

/** A select value as a coloured chip; values no longer offered still show, greyed. */
export function OptionChip({ field, value }: { field: Field; value: unknown }) {
  if (typeof value !== "string" || !value) return <span className="muted">—</span>;
  const option = field.options?.find((o) => o.value === value);
  const color = option?.color ?? "var(--muted)";
  return (
    <span className="chip" style={{ background: `${color}1f`, color }}>
      {option && <Icon name={option.icon} size={13} />}
      {value}
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
              {o.value}
            </option>
          ))}
          {text && !field.options?.some((o) => o.value === text) && (
            <option value={text}>{text} (not an option)</option>
          )}
        </select>
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
