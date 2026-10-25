import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { optionText } from "../../../shared/categories.ts";
import type { SelectOption } from "../../../shared/schema.ts";
import { filterOptions } from "../logic/option-search.ts";
import { Icon } from "./icon.tsx";

/**
 * A searchable select (M12 part 1): one text box that filters the options as you type, with
 * the arrow keys, Enter and Escape, and the chosen option shown as its emoji and label. The
 * first choice is `emptyLabel` (Uncategorized, Any) when `allowEmpty`; a value no live option
 * holds (archived) still shows its text, greyed, until changed.
 */
export function OptionPicker({
  id,
  label,
  options,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = "Uncategorized",
  placeholder,
}: {
  id?: string;
  /** The accessible name, "Category"; shown as a visible label by the caller. */
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange(value: string): void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const ownId = useId();
  const inputId = id ?? ownId;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState<string>();
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const open = query !== undefined;
  const chosen = options.find((o) => o.value === value);
  const shownText = value ? (chosen ? optionText(chosen) : value) : "";
  const matches = filterOptions(options, query ?? "");
  const rows: { value: string; text: string }[] = [
    ...(allowEmpty && (!query || emptyLabel.toLowerCase().includes(query.toLowerCase()))
      ? [{ value: "", text: emptyLabel }]
      : []),
    ...matches.map((o) => ({ value: o.value, text: optionText(o) })),
  ];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setQuery(undefined);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setQuery(undefined);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setQuery("");
        setActive(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) pick(row.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery(undefined);
    }
  };

  return (
    <div className="option-picker" ref={root}>
      <input
        id={inputId}
        className={`input${chosen?.archived ? " muted" : ""}`}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        placeholder={placeholder ?? (allowEmpty ? emptyLabel : "Type to search")}
        value={open ? query : shownText}
        onFocus={() => {
          setQuery("");
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {value && !open && (
        <button
          type="button"
          className="option-clear"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange("")}
        >
          <Icon name="x" size={13} />
        </button>
      )}
      {open && (
        <div id={listId} role="listbox" aria-label={`${label} options`} className="option-list">
          {rows.length === 0 && (
            <div className="muted" style={{ padding: "6px 10px" }}>
              No match
            </div>
          )}
          {rows.map((row, i) => (
            <div
              key={row.value || "\u0000"}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={row.value === value}
              className={`option-row-pick${i === active ? " active" : ""}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(row.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") pick(row.value);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {row.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
