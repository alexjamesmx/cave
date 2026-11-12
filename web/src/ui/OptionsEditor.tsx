import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { OptionKind, SelectOption } from "../../../shared/schema.ts";
import { addOption, moveOption, patchOption, SWATCHES, setArchived } from "../logic/options.ts";
import { Icon } from "./icon.tsx";
import { OptionTile } from "./OptionTile.tsx";

const KINDS: [OptionKind, string][] = [
  ["expense", "Expense"],
  ["income", "Income"],
  ["transfer", "Transfer"],
];

const tint = (color: string) => ({ "--c": color }) as CSSProperties;

/**
 * A popover's open state: a press outside closes it (after `onAway`, which may keep what was
 * typed), Escape closes it as it is.
 */
function usePopover(onAway?: () => void) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const away = useRef(onAway);
  away.current = onAway;
  useEffect(() => {
    if (!open) return;
    const press = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      away.current?.();
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", press);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", press);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return { open, setOpen, root };
}

/** The option's emoji on its tile; a press opens a field to type or paste another. */
function EmojiButton({
  emoji,
  fallback,
  label,
  field,
  onChange,
  dashed = false,
}: {
  emoji: string;
  fallback: ReactNode;
  label: string;
  /** The field's accessible name. */
  field: string;
  onChange(emoji: string): void;
  dashed?: boolean;
}) {
  const [text, setText] = useState(emoji);
  const commit = () => {
    if (text.trim() !== emoji) onChange(text.trim());
  };
  const { open, setOpen, root } = usePopover(commit);
  return (
    <span className="opt-pop-root" ref={root}>
      <button
        type="button"
        className={`emoji-tile opt-emoji${dashed ? " dashed" : ""}`}
        aria-label={label}
        aria-expanded={open}
        {...(emoji ? { "data-emoji": emoji } : {})}
        onClick={() => {
          if (open) commit();
          else setText(emoji);
          setOpen(!open);
        }}
      >
        {!emoji && fallback}
      </button>
      {open && (
        <span className="panel opt-pop">
          <input
            className="input"
            aria-label={field}
            placeholder="Type or paste an emoji"
            value={text}
            // biome-ignore lint/a11y/noAutofocus: the field is all the popover holds
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              commit();
              setOpen(false);
            }}
          />
        </span>
      )}
    </span>
  );
}

/** The colour dot: a press opens the sixteen swatches, and the kind for a money category. */
function ColourDot({
  option,
  kinds,
  onChange,
}: {
  option: SelectOption;
  kinds: boolean;
  onChange(patch: Partial<SelectOption>): void;
}) {
  const { open, setOpen, root } = usePopover();
  const label = `Colour for ${option.value}`;
  return (
    <span className="opt-pop-root" ref={root}>
      <button
        type="button"
        className="opt-dot"
        style={tint(option.color)}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <span className="panel opt-pop opt-colours">
          <fieldset className="opt-swatches" aria-label={label}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className="opt-swatch"
                style={tint(c)}
                aria-label={c}
                aria-pressed={c.toLowerCase() === option.color.toLowerCase()}
                onClick={() => {
                  onChange({ color: c });
                  setOpen(false);
                }}
              />
            ))}
          </fieldset>
          {kinds && (
            <fieldset className="opt-kinds" aria-label={`Kind for ${option.value}`}>
              {KINDS.map(([kind, name]) => (
                <button
                  key={kind}
                  type="button"
                  className="pill"
                  aria-pressed={option.kind === kind}
                  onClick={() => {
                    onChange({ kind });
                    setOpen(false);
                  }}
                >
                  {name}
                </button>
              ))}
            </fieldset>
          )}
        </span>
      )}
    </span>
  );
}

/**
 * One select's options, as Money → Categories and the field editor show them (M14): a row
 * each on one fixed grid (drag handle, emoji, name, colour, entry count, delete), so the
 * columns line up whatever the names. Values are fixed once added (items store them); the
 * name, emoji, colour and kind change freely. With `onDelete` (Money's lists) 🗑 deletes for
 * good, the caller moving the entries; without it 🗑 archives, as a generic list keeps its
 * values. Options archived before stay in a closed group, to restore or delete.
 */
export function OptionsEditor({
  name,
  options,
  kinds = false,
  section,
  counts,
  onChange,
  onDelete,
}: {
  /** The list's name, for labels: "Expense category", "Account". */
  name: string;
  options: SelectOption[];
  /** Whether options have a kind (money categories), changed from the colour popover. */
  kinds?: boolean;
  /**
   * Show only the options of this kind (expense also takes the kindless ones); a new option is
   * created with it.
   */
  section?: OptionKind;
  /** How many items hold each value. */
  counts?: ReadonlyMap<string, number>;
  /** Gets a change to apply to the options as stored now, so quick edits never undo each other. */
  onChange(update: (current: SelectOption[]) => SelectOption[]): void;
  onDelete?(option: SelectOption): void;
}) {
  const [draft, setDraft] = useState("");
  const [draftEmoji, setDraftEmoji] = useState("");
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState<string>();
  const inSection = (o: SelectOption) =>
    !section || o.kind === section || (section === "expense" && o.kind === undefined);
  const live = options.filter((o) => !o.archived && inSection(o));
  const archived = options.filter((o) => o.archived && inSection(o));
  const at = (list: SelectOption[], value: string) => list.findIndex((o) => o.value === value);
  const moveTo = (from: string, to: string) =>
    onChange((cur) => moveOption(cur, at(cur, from), at(cur, to)));
  const patch = (value: string, p: Partial<SelectOption>) =>
    onChange((cur) => patchOption(cur, value, p));
  const count = (value: string) => (counts ? (counts.get(value) ?? 0) : undefined);
  const lower = name.toLowerCase();

  return (
    <div className="opt-editor">
      <div className="opt-row opt-head" aria-hidden="true">
        <span />
        <span>Icon</span>
        <span>Name</span>
        <span>Colour</span>
        <span className="opt-count">{counts ? "Entries" : ""}</span>
        <span />
      </div>
      <ul aria-label={`${name} options`}>
        {live.map((o, i) => (
          <li
            key={o.value}
            className={`opt-row${dragging === o.value ? " dragging" : ""}`}
            style={tint(o.color)}
            draggable
            onDragStart={() => setDragging(o.value)}
            onDragEnd={() => setDragging(undefined)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== undefined) moveTo(dragging, o.value);
              setDragging(undefined);
            }}
          >
            <button
              type="button"
              className="opt-handle"
              aria-label={`Move ${o.value}`}
              title="Drag, or use the arrow keys"
              onKeyDown={(e) => {
                const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                const target = live[i + by];
                if (!by || !target) return;
                e.preventDefault();
                moveTo(o.value, target.value);
              }}
            >
              ⋮⋮
            </button>
            <EmojiButton
              emoji={o.emoji ?? ""}
              fallback={<Icon name={o.icon} size={18} />}
              label={`Change icon of ${o.value}`}
              field={`Emoji for ${o.value}`}
              onChange={(emoji) => patch(o.value, { emoji })}
            />
            <input
              key={`label-${o.label ?? ""}`}
              className="opt-name"
              aria-label={`Name for ${o.value}`}
              defaultValue={o.label ?? ""}
              placeholder={o.value}
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (label !== (o.label ?? "")) patch(o.value, { label });
              }}
            />
            <ColourDot option={o} kinds={kinds} onChange={(p) => patch(o.value, p)} />
            <span className="num opt-count">{count(o.value)}</span>
            {onDelete ? (
              <button
                type="button"
                className="opt-del"
                aria-label={`Delete ${o.value}`}
                onClick={() => onDelete(o)}
              >
                🗑
              </button>
            ) : (
              <button
                type="button"
                className="opt-del"
                aria-label={`Archive ${o.value}`}
                onClick={() => onChange((cur) => setArchived(cur, o.value, true))}
              >
                <Icon name="archive" size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="opt-row opt-add"
        style={tint("var(--muted)")}
        onSubmit={(e) => {
          e.preventDefault();
          const result = addOption(options, draft);
          if ("error" in result) return setError(result.error);
          const value = draft.trim();
          const emoji = draftEmoji;
          setError(undefined);
          setDraft("");
          setDraftEmoji("");
          onChange((cur) => {
            const added = addOption(cur, value);
            if ("error" in added) return cur;
            return patchOption(added.options, value, {
              ...(section ? { kind: section } : {}),
              ...(emoji ? { emoji } : {}),
            });
          });
        }}
      >
        <span />
        <EmojiButton
          emoji={draftEmoji}
          fallback="+"
          label={`Pick an icon for the new ${lower}`}
          field={`Emoji for the new ${lower}`}
          dashed
          onChange={setDraftEmoji}
        />
        <input
          className="opt-name boxed"
          aria-label={`New ${lower}`}
          placeholder={`New ${lower}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn primary opt-add-btn">
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="error opt-error">
          {error}
        </p>
      )}
      {archived.length > 0 && (
        <details className="opt-archived">
          <summary>Archived ({archived.length})</summary>
          <ul aria-label={`Archived ${lower} options`}>
            {archived.map((o) => (
              <li key={o.value} className="opt-archived-row" style={tint(o.color)}>
                <OptionTile option={o} />
                <span className="opt-archived-name">{o.label || o.value}</span>
                <span className="num m-note">{count(o.value)}</span>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Restore ${o.value}`}
                  onClick={() => onChange((cur) => setArchived(cur, o.value, false))}
                >
                  Restore
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Delete ${o.value}`}
                    onClick={() => onDelete(o)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
