import { type FormEvent, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { missingForPayment, PAYMENTS } from "../../../shared/payments.ts";
import { SUBSCRIPTION_CATEGORY } from "../../../shared/subscriptions.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { ensureAccount } from "../app/lists.ts";
import { useCollections } from "../store/queries.ts";
import { AccountPicker, soleAccount } from "./AccountPicker.tsx";
import { Icon } from "./icon.tsx";

const EVERY: [string, string][] = [
  ["monthly", "Month"],
  ["yearly", "Year"],
  ["weekly", "Week"],
];

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * A subscription: its name, amount, how often, a charge date the series starts from, and the
 * account. Editing one adds Pause or Resume and Delete. It holds no reminder: a flow ("When a
 * date arrives") does that when the owner wants one.
 */
export function SubscriptionForm({ doc, onDone }: { doc?: Doc; onDone(message: string): void }) {
  const { local } = useCave();
  const collections = useCollections(local.db);
  const sole = soleAccount(collections);
  const [title, setTitle] = useState(str(doc?.data._title));
  const [amount, setAmount] = useState(
    typeof doc?.data.amount === "number" ? String(doc.data.amount) : "",
  );
  const [repeat, setRepeat] = useState(str(doc?.data.repeat) || "monthly");
  const [due, setDue] = useState(str(doc?.data.due).slice(0, 10));
  const [account, setAccount] = useState(str(doc?.data.account) || sole || "");
  const [error, setError] = useState<string>();
  const missing = missingForPayment({ kind: "subscription", amount, due, repeat, account });
  const active = doc?.data.active !== false;
  // A new one keeps the id it was given, so a second save updates it rather than adding one.
  const [id] = useState(() => doc?.id ?? newId());
  const ref = { id, kind: "item" as const, collection: PAYMENTS };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || missing.length > 0) return;
    try {
      if (account.trim()) await ensureAccount(local, account.trim());
      await local.write(ref, {
        _title: title.trim(),
        kind: "subscription",
        amount: Number(amount),
        repeat,
        due,
        account: account.trim(),
        ...(doc ? {} : { category: SUBSCRIPTION_CATEGORY, active: true }),
      });
    } catch (err) {
      if (!(err instanceof FieldValueError)) throw err;
      return setError(err.message);
    }
    onDone(`Saved · ${title.trim()}`);
  };
  const toggle = async () => {
    await local.write(ref, { active: !active });
    onDone(`${active ? "Paused" : "Resumed"} · ${title}`);
  };
  const remove = async () => {
    if (!confirm(`Delete “${title}”? It stays in the history and can be restored.`)) return;
    await local.write(ref, { _deleted: true });
    onDone(`Deleted · ${title}`);
  };

  return (
    <form
      className="sub-form"
      aria-label={doc ? "Edit subscription" : "New subscription"}
      onSubmit={(e) => void save(e)}
    >
      <label className="quick-field">
        <span className="k">Name</span>
        <input
          className="input"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="quick-row">
        <label className="quick-field">
          <span className="k">Amount</span>
          <input
            className="input num"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="quick-field">
          <span className="k">Every</span>
          <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            {EVERY.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="quick-row">
        <label className="quick-field">
          <span className="k">Charged on</span>
          <input
            className="input"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        {!sole && (
          <div className="quick-field">
            <label className="k" htmlFor={`${ref.id}-account`}>
              Account
            </label>
            <AccountPicker
              id={`${ref.id}-account`}
              collections={collections}
              value={account}
              onChange={setAccount}
            />
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      {title.trim() && missing.length > 0 && (
        <span className="muted" style={{ fontSize: 13 }}>
          Still needs: {missing.join(", ")}.
        </span>
      )}
      <div className="sub-form-actions">
        <button
          type="submit"
          className="btn primary"
          disabled={!title.trim() || missing.length > 0}
        >
          Save
        </button>
        {doc && (
          <>
            <button type="button" className="btn" onClick={() => void toggle()}>
              <Icon name={active ? "pause" : "play"} size={14} /> {active ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: "auto" }}
              onClick={() => void remove()}
            >
              <Icon name="trash" size={14} /> Delete
            </button>
          </>
        )}
      </div>
    </form>
  );
}
