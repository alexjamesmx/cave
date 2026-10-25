import { useState } from "react";
import { optionText } from "../../../shared/categories.ts";
import type { OptionKind, SelectOption } from "../../../shared/schema.ts";
import {
  addOption,
  isHexColor,
  moveOption,
  patchOption,
  SWATCHES,
  setArchived,
} from "../logic/options.ts";
import { Icon } from "./icon.tsx";

/**
 * One select's options, as Money → Categories & accounts and the field editor show them. Values are fixed
 * once added (items store them); the name, emoji, colour and kind change freely. Options are
 * archived, never deleted, so items that hold one keep showing it.
 */
export function OptionsEditor({
  name,
  options,
  kinds = false,
  onChange,
}: {
  /** The list's name, for labels: "Category", "Account". */
  name: string;
  options: SelectOption[];
  /** Whether options have a kind (money categories). */
  kinds?: boolean;
  /** Gets a change to apply to the options as stored now, so quick edits never undo each other. */
  onChange(update: (current: SelectOption[]) => SelectOption[]): void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState<string>();
  const live = options.filter((o) => !o.archived);
  const archived = options.filter((o) => o.archived);
  const at = (list: SelectOption[], value: string) => list.findIndex((o) => o.value === value);
  const moveTo = (from: string, to: string) =>
    onChange((cur) => moveOption(cur, at(cur, from), at(cur, to)));
  const move = (value: string, by: number) => {
    const target = live[live.findIndex((o) => o.value === value) + by];
    if (target) moveTo(value, target.value);
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <ul aria-label={`${name} options`} style={{ margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {live.map((o, i) => (
          <li
            key={o.value}
            draggable
            onDragStart={() => setDragging(o.value)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== undefined) moveTo(dragging, o.value);
              setDragging(undefined);
            }}
            className="option-row"
          >
            <span className="option-grip" aria-hidden="true">
              <Icon name="grip-vertical" size={14} />
            </span>
            <span
              className="chip"
              style={{ background: `${o.color}1f`, color: o.color, minWidth: 96 }}
              title={`Stored as “${o.value}”`}
            >
              {!o.emoji && <Icon name={o.icon} size={13} />}
              {optionText(o)}
            </span>
            <input
              key={`emoji-${o.emoji ?? ""}`}
              className="input"
              aria-label={`Emoji for ${o.value}`}
              defaultValue={o.emoji ?? ""}
              placeholder="Emoji"
              style={{ width: 56 }}
              onBlur={(e) => {
                const emoji = e.target.value.trim();
                if (emoji !== (o.emoji ?? ""))
                  onChange((cur) => patchOption(cur, o.value, { emoji }));
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
                if (label !== (o.label ?? ""))
                  onChange((cur) => patchOption(cur, o.value, { label }));
              }}
            />
            {kinds && (
              <select
                className="input"
                aria-label={`Kind for ${o.value}`}
                value={o.kind ?? ""}
                style={{ width: "auto" }}
                onChange={(e) => {
                  // Read now: the update runs after React has put the controlled select back
                  // to the stored kind, so a read inside it would save the old value.
                  const kind = (e.target.value || undefined) as OptionKind | undefined;
                  onChange((cur) => patchOption(cur, o.value, { kind }));
                }}
              >
                <option value="">No kind</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            )}
            <ColorPicker
              value={o.color}
              label={`Colour for ${o.value}`}
              onChange={(color) => onChange((cur) => patchOption(cur, o.value, { color }))}
            />
            <button
              type="button"
              className="btn"
              aria-label={`Move ${o.value} up`}
              disabled={i === 0}
              onClick={() => move(o.value, -1)}
            >
              <Icon name="arrow-up" size={13} />
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`Move ${o.value} down`}
              disabled={i === live.length - 1}
              onClick={() => move(o.value, 1)}
            >
              <Icon name="arrow-down" size={13} />
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`Archive ${o.value}`}
              onClick={() => onChange((cur) => setArchived(cur, o.value, true))}
            >
              <Icon name="archive" size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          const result = addOption(options, draft);
          if ("error" in result) return setError(result.error);
          setError(undefined);
          setDraft("");
          onChange((cur) => {
            const added = addOption(cur, draft);
            return "error" in added ? cur : added.options;
          });
        }}
      >
        <input
          className="input"
          aria-label={`New ${name.toLowerCase()} option`}
          placeholder={`New ${name.toLowerCase()}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: "1 1 160px", minWidth: 0 }}
        />
        <button type="submit" className="btn">
          Add
        </button>
        {error && (
          <span role="alert" className="error">
            {error}
          </span>
        )}
      </form>
      {archived.length > 0 && (
        <details>
          <summary className="k">Archived ({archived.length})</summary>
          <ul style={{ margin: "6px 0 0", padding: 0, display: "grid", gap: 6 }}>
            {archived.map((o) => (
              <li key={o.value} className="option-row">
                <span className="muted" style={{ flex: 1 }}>
                  {optionText(o)}
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onChange((cur) => setArchived(cur, o.value, false))}
                >
                  Restore {o.value}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** A swatch palette that reads in light and dark, plus a #RRGGBB field for anything else. */
function ColorPicker({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange(color: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  return (
    <span style={{ position: "relative" }}>
      <button
        type="button"
        className="btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="swatch" style={{ background: value }} />
      </button>
      {open && (
        <fieldset className="swatch-panel panel" aria-label={label}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch-button"
              aria-label={c}
              aria-pressed={c.toLowerCase() === value.toLowerCase()}
              onClick={() => {
                onChange(c);
                setHex(c);
                setOpen(false);
              }}
            >
              <span className="swatch" style={{ background: c }} />
            </button>
          ))}
          <input
            className="input"
            aria-label={`${label} as hex`}
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isHexColor(hex)) {
                e.preventDefault();
                onChange(hex.toUpperCase());
                setOpen(false);
              }
            }}
            aria-invalid={!isHexColor(hex)}
            style={{ width: 96 }}
          />
        </fieldset>
      )}
    </span>
  );
}
