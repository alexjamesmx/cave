import { useMemo, useState } from "react";
import { shortDay } from "../../../shared/dates.ts";
import { expenseFrom, PAYMENTS, paidPatch } from "../../../shared/payments.ts";
import {
  type Candidate,
  candidatesOf,
  chargesOf,
  monthlyCost,
  monthlyTotal,
  nextMonthlyAfter,
  SUBSCRIPTION_CATEGORY,
  subscriptionsOf,
} from "../../../shared/subscriptions.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone, useToday } from "../app/hooks.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { PaymentForm, type PaymentStart } from "../ui/PaymentForm.tsx";
import { rowOpen } from "../ui/row-open.ts";
import { Sheet } from "../ui/Sheet.tsx";

const EVERY: Record<string, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const dayOfDue = (due: unknown) => str(due).slice(0, 10);

/**
 * Money → Subscriptions: every payment of kind subscription, active and cancelled, with what
 * the active ones cost a month, each one's next charge and what it has cost so far. Names
 * already charged under the subscriptions category but not set up are offered to set up,
 * starting from their last charge; the owner confirms the amount and the date. Paid logs the
 * charge, linked to its subscription, and moves the subscription to its next date; Undo
 * reverses both.
 */
export function Subscriptions() {
  const { local } = useCave();
  const payments = useItems(local.db, PAYMENTS);
  const money = useItems(local.db, "money");
  const collection = useCollections(local.db)?.find((c) => c.id === PAYMENTS);
  const today = useToday();
  const [form, setForm] = useState<PaymentStart>();
  const [open, setOpen] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [paying, setPaying] = useState<Doc>();
  const [undo, setUndo] = useState<{
    sub: Doc;
    expense: string;
    before: Record<string, unknown>;
  }>();
  const zone = useReminderZone();

  const { active, cancelled } = useMemo(() => subscriptionsOf(payments ?? []), [payments]);
  const candidates = useMemo(
    () => candidatesOf(money ?? [], [...active, ...cancelled]),
    [money, active, cancelled],
  );
  if (!payments || !money) return null;
  const { total, approx } = monthlyTotal(active);
  const next = [...active]
    .filter((s) => dayOfDue(s.data.due))
    .sort((a, b) => str(a.data.due).localeCompare(str(b.data.due)))[0];
  const setActive = (s: Doc, on: boolean) =>
    void local.write({ id: s.id, kind: "item", collection: PAYMENTS }, { active: on });
  const paid = async (sub: Doc, expense: string) => {
    const patch = paidPatch(sub, Date.now(), zone);
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, sub.data[k] ?? null]));
    await local.write({ id: expense, kind: "item", collection: "money" }, { payment: sub.id });
    await local.write({ id: sub.id, kind: "item", collection: PAYMENTS }, patch);
    setPaying(undefined);
    setUndo({ sub, expense, before });
    setMessage(undefined);
  };
  const reverse = async (u: NonNullable<typeof undo>) => {
    await local.write({ id: u.expense, kind: "item", collection: "money" }, { _deleted: true });
    await local.write({ id: u.sub.id, kind: "item", collection: PAYMENTS }, u.before);
    setUndo(undefined);
    setMessage(`Undone · ${titleOf(u.sub)}`);
  };
  const fromCharge = (c: Candidate): PaymentStart => ({
    title: titleOf(c.last),
    kind: "subscription",
    category: SUBSCRIPTION_CATEGORY,
    due: nextMonthlyAfter(str(c.last.data.date), today),
    ...(typeof c.last.data.amount === "number" ? { amount: c.last.data.amount } : {}),
    ...(str(c.last.data.account) ? { account: str(c.last.data.account) } : {}),
  });

  const row = (s: Doc, on: boolean) => {
    const charges = chargesOf(s, money);
    const spent = charges.reduce(
      (sum, c) => sum + (typeof c.data.amount === "number" ? c.data.amount : 0),
      0,
    );
    const every = EVERY[str(s.data.repeat)];
    const amount = typeof s.data.amount === "number" ? s.data.amount : undefined;
    const due = dayOfDue(s.data.due);
    const overdue = on && due !== "" && due < today;
    return (
      <li
        key={s.id}
        className={`sub-card${on ? "" : " cancelled"}`}
        {...rowOpen(() => setOpen(s.id))}
      >
        <div className="sub-card-main">
          <button type="button" className="link sub-card-title" onClick={() => setOpen(s.id)}>
            {titleOf(s)}
          </button>
          <span className={`sub-card-meta${overdue ? " error" : " muted"}`}>
            {overdue
              ? `Overdue since ${shortDay(due)}`
              : on && due
                ? `Next ${shortDay(due)}`
                : on
                  ? "Needs a date"
                  : "Cancelled"}
            {str(s.data.account) && ` · ${str(s.data.account)}`}
            {charges.length > 0 &&
              ` · ${charges.length} charge${charges.length === 1 ? "" : "s"}, ${formatMoney(spent)} so far`}
          </span>
        </div>
        <span className="num sub-card-amount">
          <span>
            {amount === undefined
              ? "—"
              : `${s.data.approx === true ? "≈ " : ""}${formatMoney(amount)}`}
            {every && <span className="muted"> / {every}</span>}
          </span>
          {on && every && every !== "month" && (
            <span className="muted sub-card-monthly">{formatMoney(monthlyCost(s))} a month</span>
          )}
        </span>
        {on && due && (
          <button type="button" className="btn" onClick={() => setPaying(s)}>
            <Icon name="check" size={14} /> Paid
          </button>
        )}
        <button type="button" className="btn" onClick={() => setActive(s, !on)}>
          {on ? "Cancel" : "Restore"}
        </button>
      </li>
    );
  };

  return (
    <div className="subs-page">
      <section className="stats" aria-label="Subscriptions summary">
        <div className="panel stat">
          <span className="k">Per month</span>
          <span className="num stat-value">
            {approx ? "≈ " : ""}
            {formatMoney(total)}
          </span>
          <span className="muted">{formatMoney(total * 12)} a year</span>
        </div>
        <div className="panel stat">
          <span className="k">Active</span>
          <span className="num stat-value">{active.length}</span>
          <span className="muted">{cancelled.length} cancelled</span>
        </div>
        <div className="panel stat">
          <span className="k">Next charge</span>
          <span className="stat-value">{next ? titleOf(next) : "—"}</span>
          <span className="muted">{next ? shortDay(dayOfDue(next.data.due)) : "Nothing due"}</span>
        </div>
      </section>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => setForm({ kind: "subscription", category: SUBSCRIPTION_CATEGORY })}
        >
          <Icon name="plus" size={15} /> New subscription
        </button>
        <p role="status" className="muted" style={{ margin: 0 }}>
          {message}
        </p>
      </div>
      {undo && (
        <div className="panel banner">
          <span>Paid · {titleOf(undo.sub)}: charge saved, next date set.</span>
          <button type="button" className="btn" onClick={() => void reverse(undo)}>
            Undo
          </button>
        </div>
      )}
      {candidates.length > 0 && (
        <section className="panel subs-found" aria-label="Found in your transactions">
          <span className="k">Found in your transactions · not set up yet</span>
          <ul>
            {candidates.map((c) => (
              <li key={c.key}>
                <span className="sub-card-title">{titleOf(c.last)}</span>
                <span className="muted sub-card-meta">
                  Last {shortDay(str(c.last.data.date).slice(0, 10))}
                  {typeof c.last.data.amount === "number" && `, ${formatMoney(c.last.data.amount)}`}{" "}
                  · {c.count} charge{c.count === 1 ? "" : "s"}, {formatMoney(c.total)}
                </span>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Set up ${titleOf(c.last)}`}
                  onClick={() => setForm(fromCharge(c))}
                >
                  Set up
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel subs-list" aria-label="Active subscriptions">
        <span className="k">Active · {active.length}</span>
        {active.length === 0 ? (
          <span className="muted">No active subscriptions yet.</span>
        ) : (
          <ul>{active.map((s) => row(s, true))}</ul>
        )}
      </section>
      {cancelled.length > 0 && (
        <section className="panel subs-list" aria-label="Cancelled subscriptions">
          <span className="k">Cancelled · {cancelled.length}</span>
          <ul>{cancelled.map((s) => row(s, false))}</ul>
        </section>
      )}
      {form && (
        <Sheet title="New subscription" onClose={() => setForm(undefined)}>
          <PaymentForm
            start={form}
            onSaved={(m) => {
              setForm(undefined);
              setMessage(m);
            }}
          />
        </Sheet>
      )}
      {paying && (
        <Sheet title={`Paid · ${titleOf(paying)}`} onClose={() => setPaying(undefined)}>
          <MoneyForm
            prefill={expenseFrom(paying)}
            submitLabel="Save charge and mark paid"
            onSaved={(expense) => void paid(paying, expense)}
          />
        </Sheet>
      )}
      {open && collection && (
        <ItemDrawer
          key={open}
          collection={withActiveFields(collection)}
          id={open}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}
