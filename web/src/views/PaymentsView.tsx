import { useMemo, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { newId } from "../../../shared/ids.ts";
import { expenseFrom, paidPatch, upcomingPayments } from "../../../shared/payments.ts";
import { findSubscriptions } from "../../../shared/subscription-finder.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone } from "../app/hooks.ts";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { OptionChip } from "../ui/fields.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { PaymentForm } from "../ui/PaymentForm.tsx";
import type { ViewProps } from "./types.ts";

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Undo {
  title: string;
  expense: string;
  payment: Doc;
  before: Record<string, unknown>;
}

/**
 * Payments due in the next 30 days with their total, overdue first. "Paid" logs the expense
 * and moves the same payment to its next date; Undo reverses both.
 */
export function PaymentsView({ collection, items, open }: ViewProps) {
  const { local } = useCave();
  const zone = useReminderZone();
  const now = useNow().getTime();
  const money = useItems(local.db, "money");
  const [paying, setPaying] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [finding, setFinding] = useState(false);
  const [undo, setUndo] = useState<Undo>();
  const [message, setMessage] = useState<string>();
  const kind = collection.data.fields.find((f) => f.id === "kind");

  const upcoming = useMemo(
    () => upcomingPayments(items, now, now + WINDOW_DAYS * DAY_MS, zone),
    [items, now, zone],
  );
  const byId = new Map(items.map((d) => [d.id, d]));
  const total = upcoming.reduce((sum, p) => {
    const amount = byId.get(p.id)?.data.amount;
    return sum + (typeof amount === "number" ? amount : 0);
  }, 0);
  const varies = upcoming.some((p) => byId.get(p.id)?.data.approx === true);
  const candidates = useMemo(
    () => (finding ? findSubscriptions(money ?? [], items) : []),
    [finding, money, items],
  );

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
  const addCandidate = async (c: (typeof candidates)[number]) => {
    await local.write(
      { id: newId(), kind: "item", collection: collection.id },
      {
        _title: c.title,
        kind: "subscription",
        amount: c.amount,
        due: c.nextDue,
        repeat: c.repeat,
        active: true,
        approx: false,
        ...(c.category ? { category: c.category } : {}),
        ...(c.account ? { account: c.account } : {}),
      },
    );
    setMessage(`Added · ${c.title}`);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" onClick={() => setAdding(!adding)}>
          <Icon name="plus" size={15} /> New payment
        </button>
        <button type="button" className="btn" onClick={() => setFinding(!finding)}>
          <Icon name="search" size={15} /> Find subscriptions
        </button>
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
      {finding && (
        <section
          className="panel"
          aria-label="Possible subscriptions"
          style={{ padding: 16, display: "grid", gap: 6 }}
        >
          <span className="k">From your money history · nothing is added until you confirm</span>
          {candidates.length === 0 && <span className="muted">Nothing repeats regularly.</span>}
          {candidates.map((c) => (
            <div key={c.key} className="system-row">
              <strong style={{ flex: 1 }}>{c.title}</strong>
              <span className="num">{formatMoney(c.amount)}</span>
              <span className="muted">
                {c.repeat} · {c.count} times · next {c.nextDue}
              </span>
              <button type="button" className="btn" onClick={() => void addCandidate(c)}>
                Add as payment
              </button>
            </div>
          ))}
        </section>
      )}
      <section
        className="panel"
        aria-label="Next 30 days"
        style={{ padding: 16, display: "grid", gap: 4 }}
      >
        <span className="k">
          Next {WINDOW_DAYS} days · {varies ? "≈ " : ""}
          {formatMoney(total)}
        </span>
        {upcoming.length === 0 && <span className="muted">Nothing due.</span>}
        {upcoming.map((p) => {
          const doc = byId.get(p.id) as Doc;
          const amount = doc.data.amount;
          return (
            <div key={p.id} style={{ display: "grid", gap: 8 }}>
              <div className={`system-row${p.overdue ? " overdue" : ""}`}>
                <span className="num" style={{ color: p.overdue ? "var(--expense)" : undefined }}>
                  {localDateTime(new Date(p.at), zone.timeZone).replace("T", " ")}
                </span>
                <button
                  type="button"
                  className="link"
                  style={{ flex: 1, textAlign: "left" }}
                  onClick={() => open(p.id)}
                >
                  {titleOf(doc)}
                </button>
                {kind && <OptionChip field={kind} value={doc.data.kind} />}
                <span className="num">
                  {typeof amount === "number"
                    ? `${doc.data.approx === true ? "≈ " : ""}${formatMoney(amount)}`
                    : "—"}
                </span>
                {doc.data.autopay === true && <span className="chip">autopay</span>}
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPaying(paying === p.id ? undefined : p.id)}
                >
                  Paid
                </button>
              </div>
              {paying === p.id && (
                <MoneyForm
                  prefill={expenseFrom(doc)}
                  submitLabel="Save expense and mark paid"
                  onSaved={(id) => void paid(doc, id)}
                />
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
