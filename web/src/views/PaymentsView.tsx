import { useMemo, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import {
  expenseFrom,
  groupPayments,
  type PaymentGroups,
  paidPatch,
  upcomingPayments,
} from "../../../shared/payments.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone } from "../app/hooks.ts";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { OptionChip } from "../ui/fields.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { PaymentForm } from "../ui/PaymentForm.tsx";
import { rowOpen } from "../ui/row-open.ts";
import type { ViewProps } from "./types.ts";

const WINDOW_DAYS = 30;

const GROUPS: [keyof PaymentGroups, string][] = [
  ["overdue", "Overdue"],
  ["week", "This week"],
  ["later", "Later"],
  ["needsDate", "Needs date"],
  ["inactive", "Inactive"],
];

/** A due date typed in place: an overdue payment's next one, or a first one. */
function SetDue({ doc, label, collection }: { doc: Doc; label: string; collection: string }) {
  const { local } = useCave();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <span style={{ display: "flex", gap: 6 }} data-row-control="">
      <input
        className="input"
        type="datetime-local"
        aria-label={`${label} for ${titleOf(doc)}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="button"
        className="btn primary"
        disabled={!value}
        onClick={() =>
          void local
            .write({ id: doc.id, kind: "item", collection }, { due: value })
            .then(() => setOpen(false))
        }
      >
        Save
      </button>
    </span>
  );
}
const DAY_MS = 24 * 60 * 60 * 1000;

interface Undo {
  title: string;
  expense: string;
  payment: Doc;
  before: Record<string, unknown>;
}

/**
 * Every payment by when it is next due: Overdue, This week, Later, Needs date, Inactive, with
 * the next 30 days' total. "Paid" logs the expense and moves the payment to its next date; Undo
 * reverses both. An overdue one can also get a new date or be deactivated.
 */
export function PaymentsView({ collection, items, open }: ViewProps) {
  const { local } = useCave();
  const zone = useReminderZone();
  const now = useNow().getTime();
  const [paying, setPaying] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [undo, setUndo] = useState<Undo>();
  const [message, setMessage] = useState<string>();
  const kind = collection.data.fields.find((f) => f.id === "kind");

  const upcoming = useMemo(
    () => upcomingPayments(items, now, now + WINDOW_DAYS * DAY_MS, zone),
    [items, now, zone],
  );
  const groups = useMemo(() => groupPayments(items, now, zone), [items, now, zone]);
  const byId = new Map(items.map((d) => [d.id, d]));
  const total = upcoming.reduce((sum, p) => {
    const amount = byId.get(p.id)?.data.amount;
    return sum + (typeof amount === "number" ? amount : 0);
  }, 0);
  const varies = upcoming.some((p) => byId.get(p.id)?.data.approx === true);

  const paid = async (payment: Doc, expense: string) => {
    const patch = paidPatch(payment, Date.now(), zone);
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, payment.data[k] ?? null]));
    await local.write({ id: payment.id, kind: "item", collection: collection.id }, patch);
    setPaying(undefined);
    setUndo({ title: titleOf(payment), expense, payment, before });
    setMessage(undefined);
  };
  const reverse = async (u: Undo) => {
    await local.write({ id: u.expense, kind: "item", collection: "money" }, { _deleted: true });
    await local.write({ id: u.payment.id, kind: "item", collection: collection.id }, u.before);
    setUndo(undefined);
    setMessage(`Undone · ${u.title}`);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" onClick={() => setAdding(!adding)}>
          <Icon name="plus" size={15} /> New payment
        </button>
        <a className="btn" href="/money/review">
          <Icon name="search" size={15} /> Review subscriptions
        </a>
      </div>
      {adding && (
        <PaymentForm
          onSaved={(m) => {
            setAdding(false);
            setMessage(m);
          }}
        />
      )}
      <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
        {message}
      </p>
      {undo && (
        <div className="panel banner">
          <span>Paid · {undo.title}: expense saved, next date set.</span>
          <button type="button" className="btn" onClick={() => void reverse(undo)}>
            Undo
          </button>
        </div>
      )}
      <section
        className="panel"
        aria-label="Payments by due date"
        style={{ padding: 16, display: "grid", gap: 12 }}
      >
        <span className="k">
          Next {WINDOW_DAYS} days · {varies ? "≈ " : ""}
          {formatMoney(total)}
        </span>
        {GROUPS.every(([key]) => groups[key].length === 0) && (
          <span className="muted">No payments yet.</span>
        )}
        {GROUPS.filter(([key]) => groups[key].length > 0).map(([key, label]) => (
          <section key={key} aria-label={label} style={{ display: "grid", gap: 4 }}>
            <span className={`k${key === "overdue" ? " error" : ""}`}>{label}</span>
            {groups[key].map((p) => {
              const id = typeof p === "string" ? p : p.id;
              const doc = byId.get(id) as Doc;
              return (
                <div key={id} style={{ display: "grid", gap: 8 }}>
                  <div
                    className={`sub-row${key === "overdue" ? " overdue" : ""}${key === "inactive" ? " muted" : ""}`}
                    {...rowOpen(() => open(id))}
                  >
                    <span
                      className="num"
                      style={{ color: key === "overdue" ? "var(--expense)" : undefined }}
                    >
                      {typeof p === "string"
                        ? key === "needsDate"
                          ? "Needs date"
                          : "Inactive"
                        : localDateTime(new Date(p.at), zone.timeZone).replace("T", " ")}
                    </span>
                    <button
                      type="button"
                      className="link"
                      style={{ flex: 1, textAlign: "left" }}
                      onClick={() => open(id)}
                    >
                      {titleOf(doc)}
                    </button>
                    {kind && <OptionChip field={kind} value={doc.data.kind} />}
                    <span className="num">
                      {typeof doc.data.amount === "number"
                        ? `${doc.data.approx === true ? "≈ " : ""}${formatMoney(doc.data.amount)}`
                        : "—"}
                    </span>
                    {doc.data.autopay === true && <span className="chip">autopay</span>}
                    {(key === "overdue" || key === "week" || key === "later") && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setPaying(paying === id ? undefined : id)}
                      >
                        Paid
                      </button>
                    )}
                    {(key === "overdue" || key === "needsDate") && (
                      <SetDue
                        doc={doc}
                        label={key === "overdue" ? "Set next date" : "Set date"}
                        collection={collection.id}
                      />
                    )}
                    {key === "overdue" && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          void local.write(
                            { id, kind: "item", collection: collection.id },
                            { active: false },
                          )
                        }
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                  {paying === id && (
                    <MoneyForm
                      prefill={expenseFrom(doc)}
                      submitLabel="Save expense and mark paid"
                      onSaved={(expense) => void paid(doc, expense)}
                    />
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </section>
    </div>
  );
}
