import { type CSSProperties, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { categoriesFor, optionText } from "../../../shared/categories.ts";
import { localDateTime } from "../../../shared/dates.ts";
import { FieldValueError, offeredOptions } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import type { SelectOption } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { useNow, useTimeZone } from "../app/hooks.ts";
import { ensureAccount } from "../app/lists.ts";
import { formatMoney } from "../logic/format.ts";
import { byUse, lastAccount, parseAmount, saveLabel } from "../logic/money-form.ts";
import { filterOptions } from "../logic/option-search.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { MarkTile, OptionTile } from "./OptionTile.tsx";

type Direction = "expense" | "income";
type When = "today" | "yesterday" | "other";

interface MoneyPrefill {
  title?: string;
  amount?: number;
  category?: string;
  account?: string;
  /** The payment this entry pays, linked so its history counts it. */
  payment?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Tiles before More: two rows of four, More being the last. */
const FIRST = 7;

const tint = (color: string) => ({ "--c": color }) as CSSProperties;
const nameOf = (o: SelectOption) => o.label || o.value;

/**
 * An expense or income in a few taps (M14): the amount first, the direction, a category from
 * the most used tiles (More shows and searches them all), an account chip and when. Nothing is
 * guessed: no category unless one is tapped. The account starts on the last one used and is
 * always shown; with none yet, one is typed in place and Save waits for it. `onSaved` gets the
 * new entry's id. With `keepOpen` the form stays after a save, cleared but for its direction,
 * account and day, so a batch of receipts goes in without a click per entry.
 */
export function MoneyForm({
  prefill = {},
  onSaved,
  submitLabel,
  keepOpen = false,
}: {
  prefill?: MoneyPrefill;
  onSaved(id: string, message: string): void;
  submitLabel?: string;
  keepOpen?: boolean;
}) {
  const { local } = useCave();
  const timeZone = useTimeZone();
  const now = useNow();
  const collections = useCollections(local.db);
  const items = useItems(local.db, "money");
  const fields = collections?.find((c) => c.id === "money")?.data.fields;
  const options = fields?.find((f) => f.id === "category")?.options ?? [];
  const accountField = fields?.find((f) => f.id === "account");
  const accounts = accountField ? offeredOptions(accountField) : [];
  const [direction, setDirection] = useState<Direction>("expense");
  const [amount, setAmount] = useState(prefill.amount === undefined ? "" : String(prefill.amount));
  const [title, setTitle] = useState(prefill.title ?? "");
  const [category, setCategory] = useState(prefill.category ?? "");
  const [picked, setPicked] = useState(prefill.account);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [when, setWhen] = useState<When>("today");
  const [other, setOther] = useState("");
  const [more, setMore] = useState(false);
  const [find, setFind] = useState("");
  const [error, setError] = useState<string>();
  const amountId = useId();
  const amountBox = useRef<HTMLInputElement>(null);
  useEffect(() => amountBox.current?.focus(), []);

  const value = parseAmount(amount);
  const offered = categoriesFor(options, direction);
  const ranked = byUse(items ?? [], offered);
  const chosen = offered.find((o) => o.value === category);
  // A ninth tile would only replace More, so up to eight show without one.
  const folds = ranked.length > FIRST + 1;
  const folded = folds && !more;
  let tiles = folded ? ranked.slice(0, FIRST) : filterOptions(ranked, find);
  if (folded && chosen && !tiles.includes(chosen)) tiles = [...tiles.slice(0, FIRST - 1), chosen];
  const live = (a: string | undefined) => a !== undefined && accounts.some((o) => o.value === a);
  const adding = typing || accounts.length === 0;
  const account = adding
    ? typed.trim()
    : live(picked)
      ? (picked as string)
      : (lastAccount(items ?? [], accounts) ?? "");
  const ready = value !== undefined && account !== "" && (when !== "other" || other !== "");

  const pickDirection = (next: Direction) => {
    setDirection(next);
    if (category && !categoriesFor(options, next).some((o) => o.value === category))
      setCategory("");
  };
  const dateOf = () =>
    when === "other"
      ? other
      : localDateTime(new Date(Date.now() - (when === "yesterday" ? DAY_MS : 0)), timeZone);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || value === undefined) return;
    const id = newId();
    try {
      await ensureAccount(local, account);
      await local.write(
        { id, kind: "item", collection: "money" },
        {
          _title: title.trim(),
          amount: value,
          direction,
          date: dateOf(),
          ...(category ? { category } : {}),
          account,
          ...(prefill.payment ? { payment: prefill.payment } : {}),
        },
      );
    } catch (err) {
      if (!(err instanceof FieldValueError)) throw err;
      return setError(err.message);
    }
    setError(undefined);
    const what = title.trim() || (chosen ? nameOf(chosen) : formatMoney(value));
    onSaved(id, `Saved · ${direction === "income" ? "Income" : "Expense"} · ${what}`);
    if (keepOpen) {
      setAmount("");
      setTitle("");
      setCategory("");
      setMore(false);
      setFind("");
      setPicked(account);
      setTyping(false);
      setTyped("");
      amountBox.current?.focus();
    }
  };

  return (
    <form
      className={`money-form ${direction}`}
      aria-label={direction === "income" ? "Income" : "Expense"}
      onSubmit={(e) => void submit(e)}
    >
      <fieldset className="mf-seg">
        <legend className="sr">Direction</legend>
        {(["expense", "income"] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={d}
            aria-pressed={direction === d}
            onClick={() => pickDirection(d)}
          >
            {d === "expense" ? "Expense" : "Income"}
          </button>
        ))}
      </fieldset>

      <div className="mf-amount">
        <label htmlFor={amountId}>Amount</label>
        <div className="mf-figure">
          <span aria-hidden="true">{direction === "income" ? "+" : "−"}$</span>
          <input
            id={amountId}
            ref={amountBox}
            className="num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: `calc(${Math.max(amount.length, 1)}ch + 6px)` }}
          />
        </div>
        <input
          className="input mf-title"
          aria-label="Title"
          placeholder="What was it? (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <fieldset className="mf-block">
        <legend className="k">Category</legend>
        {more && (
          <input
            className="input"
            aria-label="Find a category"
            placeholder="Find a category"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (tiles[0]) setCategory(tiles[0].value);
            }}
          />
        )}
        <div className="mf-cats">
          {tiles.map((o) => (
            <button
              key={o.value}
              type="button"
              className="mf-cat"
              aria-pressed={category === o.value}
              style={tint(o.color)}
              onClick={() => setCategory(category === o.value ? "" : o.value)}
            >
              <OptionTile option={o} />
              <span className="mf-cat-name">{nameOf(o)}</span>
            </button>
          ))}
          {folds && (
            <button
              type="button"
              className="mf-cat"
              aria-expanded={more}
              style={tint("var(--muted)")}
              onClick={() => {
                setMore(!more);
                setFind("");
              }}
            >
              <MarkTile mark={more ? "↑" : "⋯"} />
              <span className="mf-cat-name">{more ? "Fewer" : "More"}</span>
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className="mf-block">
        <legend className="k">Account</legend>
        {accounts.length === 0 ? (
          <input
            className="input"
            aria-label="Add an account"
            placeholder="Add an account, like your card"
            required
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        ) : (
          <div className="mf-chips">
            {accounts.map((o) => (
              <button
                key={o.value}
                type="button"
                className="pill"
                aria-pressed={!typing && account === o.value}
                onClick={() => {
                  setPicked(o.value);
                  setTyping(false);
                }}
              >
                {optionText(o)}
              </button>
            ))}
            {typing ? (
              <input
                className="input mf-new-account"
                aria-label="New account"
                placeholder="New account"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            ) : (
              <button type="button" className="pill" onClick={() => setTyping(true)}>
                + New
              </button>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="mf-block">
        <legend className="k">When</legend>
        <div className="mf-chips">
          <button
            type="button"
            className="pill"
            aria-pressed={when === "today"}
            onClick={() => setWhen("today")}
          >
            Today · {localDateTime(now, timeZone).slice(11, 16)}
          </button>
          <button
            type="button"
            className="pill"
            aria-pressed={when === "yesterday"}
            onClick={() => setWhen("yesterday")}
          >
            Yesterday
          </button>
          <button
            type="button"
            className="pill"
            aria-pressed={when === "other"}
            onClick={() => {
              setWhen("other");
              if (!other) setOther(localDateTime(new Date(), timeZone));
            }}
          >
            📅 Other
          </button>
        </div>
        {when === "other" && (
          <input
            className="input"
            type="datetime-local"
            aria-label="Date and time"
            required
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
        )}
      </fieldset>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="submit" className="mf-save" disabled={!ready}>
        {submitLabel ?? saveLabel(direction, value, chosen && nameOf(chosen))}
      </button>
    </form>
  );
}
