import { useState } from "react";
import { optionText } from "../../../shared/categories.ts";
import { offeredOptions } from "../../../shared/fields.ts";
import type { CollectionDoc } from "../store/queries.ts";

const NEW = "\u0000new";

const accountField = (collections: CollectionDoc[] | undefined) =>
  collections?.find((c) => c.id === "money")?.data.fields.find((f) => f.id === "account");

/**
 * The one live account, when the list holds exactly one (M12 part 1): forms preselect it and
 * hide the picker, and the ledger hides its account column and filter. `undefined` before the
 * list is loaded, or with none or several.
 */
export function soleAccount(collections: CollectionDoc[] | undefined): string | undefined {
  const field = accountField(collections);
  if (!field) return undefined;
  const live = offeredOptions(field);
  return live.length === 1 ? live[0]?.value : undefined;
}

/** The accounts list as a select, plus "New account…" to type one; saving adds it to the list. */
export function AccountPicker({
  id,
  collections,
  value,
  onChange,
}: {
  id: string;
  collections: CollectionDoc[] | undefined;
  value: string;
  onChange(value: string): void;
}) {
  const field = accountField(collections);
  const offered = field ? offeredOptions(field) : [];
  const [typing, setTyping] = useState(false);
  const known = offered.some((o) => o.value === value);

  if (typing || (value && !known && !field?.options?.some((o) => o.value === value)))
    return (
      <span style={{ display: "flex", gap: 6 }}>
        <input
          id={id}
          className="input"
          aria-label="New account"
          placeholder="New account"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setTyping(false);
            onChange("");
          }}
        >
          List
        </button>
      </span>
    );
  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW) {
          setTyping(true);
          onChange("");
        } else onChange(e.target.value);
      }}
    >
      <option value="">No account</option>
      {offered.map((o) => (
        <option key={o.value} value={o.value}>
          {optionText(o)}
        </option>
      ))}
      {value && !known && <option value={value}>{value} (archived)</option>}
      <option value={NEW}>New account…</option>
    </select>
  );
}
