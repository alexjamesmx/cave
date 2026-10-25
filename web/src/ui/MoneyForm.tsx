import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { categoriesFor } from "../../../shared/categories.ts";
import { localDateTime } from "../../../shared/dates.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { useCave } from "../app/context.ts";
import { useTimeZone } from "../app/hooks.ts";
import { ensureAccount } from "../app/lists.ts";
import { useCollections } from "../store/queries.ts";
import { AccountPicker, soleAccount } from "./AccountPicker.tsx";
import { OptionPicker } from "./OptionPicker.tsx";

type Direction = "expense" | "income";

interface MoneyPrefill {
  title?: string;
  amount?: number;
  category?: string;
  account?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function Labelled({ label, children }: { label: string; children(id: string): ReactNode }) {
  const id = useId();
  return (
    <div className="quick-field">
      <label className="k" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/**
 * An expense or income on any day and time, the direction's categories in a searchable
 * select. Nothing is guessed: no category unless one is picked; the one live account, when
 * there is exactly one, is taken without asking. `onSaved` gets the new entry's id. With
 * `keepOpen` the form stays after a save with its date, cleared for the next entry, so a
 * batch of receipts goes in without a click per entry.
 */
export function MoneyForm({
  prefill = {},
  onSaved,
  submitLabel = "Save",
  keepOpen = false,
}: {
  prefill?: MoneyPrefill;
  onSaved(id: string, message: string): void;
  submitLabel?: string;
  keepOpen?: boolean;
}) {
  const { local } = useCave();
  const timeZone = useTimeZone();
  const collections = useCollections(local.db);
  const options =
    collections?.find((c) => c.id === "money")?.data.fields.find((f) => f.id === "category")
      ?.options ?? [];
  const sole = soleAccount(collections);
  const [direction, setDirection] = useState<Direction>("expense");
  const [amount, setAmount] = useState(prefill.amount === undefined ? "" : String(prefill.amount));
  const [title, setTitle] = useState(prefill.title ?? "");
  const [category, setCategory] = useState(prefill.category ?? "");
  const [account, setAccount] = useState(prefill.account ?? "");
  const [date, setDate] = useState(() => localDateTime(new Date(), timeZone));
  const [error, setError] = useState<string>();
  const amountBox = useRef<HTMLInputElement>(null);
  const shown = categoriesFor(options, direction);
  useEffect(() => {
    if (sole && !prefill.account) setAccount(sole);
  }, [sole, prefill.account]);

  const pickDirection = (next: Direction) => {
    setDirection(next);
    if (category && !categoriesFor(options, next).some((o) => o.value === category))
      setCategory("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return;
    const id = newId();
    try {
      if (account.trim()) await ensureAccount(local, account.trim());
      await local.write(
        { id, kind: "item", collection: "money" },
        {
          _title: title.trim(),
          amount: value,
          direction,
          // No date stays no date: it shows under Undated and no total counts it.
          ...(date ? { date } : {}),
          ...(category ? { category } : {}),
          ...(account.trim() ? { account: account.trim() } : {}),
        },
      );
    } catch (err) {
      if (!(err instanceof FieldValueError)) throw err;
      return setError(err.message);
    }
    setError(undefined);
    onSaved(id, `Saved · ${direction === "income" ? "Income" : "Expense"} · ${title.trim()}`);
    if (keepOpen) {
      setAmount("");
      setTitle("");
      setCategory("");
      amountBox.current?.focus();
    }
  };

  return (
    <form
      className="panel quick-form"
      aria-label={direction === "income" ? "Income" : "Expense"}
      onSubmit={(e) => void submit(e)}
    >
      <fieldset className="quick-row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr">Direction</legend>
        {(["expense", "income"] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={`btn${direction === d ? " primary" : ""}`}
            aria-pressed={direction === d}
            onClick={() => pickDirection(d)}
          >
            {d === "expense" ? "Expense" : "Income"}
          </button>
        ))}
      </fieldset>
      <div className="quick-row">
        <Labelled label="Amount">
          {(id) => (
            <input
              id={id}
              ref={amountBox}
              className="input num"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Labelled>
        <Labelled label="Title">
          {(id) => (
            <input
              id={id}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Labelled>
      </div>
      <div className="quick-row">
        <Labelled label="Category">
          {(id) => (
            <OptionPicker
              id={id}
              label="Category"
              options={shown}
              value={category}
              onChange={setCategory}
            />
          )}
        </Labelled>
        {!sole && (
          <Labelled label="Account">
            {(id) => (
              <AccountPicker
                id={id}
                collections={collections}
                value={account}
                onChange={setAccount}
              />
            )}
          </Labelled>
        )}
      </div>
      <div className="quick-row" style={{ alignItems: "end" }}>
        <Labelled label="When">
          {(id) => (
            <input
              id={id}
              className="input"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Labelled>
        <button
          type="button"
          className="btn"
          onClick={() => setDate(localDateTime(new Date(), timeZone))}
        >
          Today
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setDate(localDateTime(new Date(Date.now() - DAY_MS), timeZone))}
        >
          Yesterday
        </button>
        <button type="button" className="btn" aria-pressed={!date} onClick={() => setDate("")}>
          No date
        </button>
      </div>
      {!date && (
        <span className="muted" style={{ fontSize: 13 }}>
          Saved without a date: it shows under Undated in Transactions and no total counts it.
        </span>
      )}
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <button type="submit" className="btn primary" disabled={!(Number(amount) > 0)}>
        {submitLabel}
      </button>
    </form>
  );
}
