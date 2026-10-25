import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { missingForPayment, PAYMENT_KINDS, PAYMENTS } from "../../../shared/payments.ts";
import { REPEATS } from "../../../shared/recurrence.ts";
import { useCave } from "../app/context.ts";
import { ensureAccount } from "../app/lists.ts";
import { useCollections } from "../store/queries.ts";
import { AccountPicker, soleAccount } from "./AccountPicker.tsx";
import { OptionPicker } from "./OptionPicker.tsx";

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

/** A payment: a card statement, a subscription, a bill. It repeats monthly unless changed. */
export function PaymentForm({ onSaved }: { onSaved(message: string): void }) {
  const { local } = useCave();
  const collections = useCollections(local.db);
  const categories =
    collections?.find((c) => c.id === PAYMENTS)?.data.fields.find((f) => f.id === "category")
      ?.options ?? [];
  const sole = soleAccount(collections);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("card");
  const [amount, setAmount] = useState("");
  const [approx, setApprox] = useState(false);
  const [category, setCategory] = useState("");
  const [account, setAccount] = useState("");
  const [due, setDue] = useState("");
  const [repeat, setRepeat] = useState("monthly");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (sole) setAccount(sole);
  }, [sole]);
  const missing = missingForPayment({ kind, amount, due, repeat, account });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || missing.length > 0) return;
    try {
      if (account.trim()) await ensureAccount(local, account.trim());
      await local.write(
        { id: newId(), kind: "item", collection: PAYMENTS },
        {
          _title: title.trim(),
          kind,
          due,
          repeat,
          approx,
          active: true,
          ...(amount ? { amount: Number(amount) } : {}),
          ...(category ? { category } : {}),
          ...(account.trim() ? { account: account.trim() } : {}),
        },
      );
    } catch (err) {
      if (!(err instanceof FieldValueError)) throw err;
      return setError(err.message);
    }
    onSaved(`Saved · Payment · ${title.trim()}`);
  };

  return (
    <form className="panel quick-form" aria-label="Payment" onSubmit={(e) => void submit(e)}>
      <div className="quick-row">
        <Labelled label="Title">
          {(id) => (
            <input
              id={id}
              className="input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Labelled>
        <Labelled label="Kind">
          {(id) => (
            <select
              id={id}
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {PAYMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </Labelled>
      </div>
      <div className="quick-row" style={{ alignItems: "end" }}>
        <Labelled label="Amount (expected)">
          {(id) => (
            <input
              id={id}
              className="input num"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Labelled>
        <label style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 8 }}>
          <input type="checkbox" checked={approx} onChange={(e) => setApprox(e.target.checked)} />
          Amount varies
        </label>
      </div>
      <div className="quick-row">
        <Labelled label="Due">
          {(id) => (
            <input
              id={id}
              className="input"
              type="datetime-local"
              required
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          )}
        </Labelled>
        <Labelled label="Repeat">
          {(id) => (
            <select
              id={id}
              className="input"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            >
              {REPEATS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </Labelled>
      </div>
      <div className="quick-row">
        <Labelled label="Category">
          {(id) => (
            <OptionPicker
              id={id}
              label="Category"
              options={categories}
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
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      {title.trim() && missing.length > 0 && (
        <span className="muted" style={{ fontSize: 13 }}>
          {kind === "subscription" ? "A subscription needs" : "Still needs"}: {missing.join(", ")}.
        </span>
      )}
      <button type="submit" className="btn primary" disabled={!title.trim() || missing.length > 0}>
        Save
      </button>
    </form>
  );
}
