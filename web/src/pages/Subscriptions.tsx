import { useMemo, useState } from "react";
import { isActive, PAYMENTS } from "../../../shared/payments.ts";
import {
  chargesOf,
  historyOf,
  monthlyCost,
  monthlyTotal,
  nextCharge,
  subscriptionsOf,
} from "../../../shared/subscriptions.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone } from "../app/hooks.ts";
import { flowPath } from "../app/router.ts";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";
import { rowOpen } from "../ui/row-open.ts";
import { Sheet } from "../ui/Sheet.tsx";
import { SubscriptionForm } from "../ui/SubscriptionForm.tsx";

const EVERY: Record<string, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};
const CHIPS = ["active", "paused", "all"] as const;
type Chip = (typeof CHIPS)[number];
const CHIP_LABEL: Record<Chip, string> = { active: "Active", paused: "Paused", all: "All" };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const day = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const monthYear = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Money → Subscriptions: one table of what the owner pays for, with the plan on top (a month,
 * a year) and each one's history (spent, since the first charge) from the real expenses. A
 * row opens it to edit, pause or delete. Reminders are flows, attached from Flows.
 */
export function Subscriptions() {
  const { local } = useCave();
  const payments = useItems(local.db, PAYMENTS);
  const money = useItems(local.db, "money");
  const zone = useReminderZone();
  const now = useNow().getTime();
  const [chip, setChip] = useState<Chip>("active");
  const [open, setOpen] = useState<Doc | "new">();
  const [message, setMessage] = useState<string>();

  const rows = useMemo(
    () =>
      subscriptionsOf(payments ?? []).map((doc) => ({
        doc,
        on: isActive(doc),
        next: nextCharge(doc, now, zone),
        ...historyOf(chargesOf(doc, money ?? [])),
      })),
    [payments, money, now, zone],
  );
  if (!payments || !money) return null;
  const active = rows.filter((r) => r.on);
  const { total, approx } = monthlyTotal(active.map((r) => r.doc));
  const spent = rows.reduce((sum, r) => sum + r.spent, 0);
  const count = { active: active.length, paused: rows.length - active.length, all: rows.length };
  const shown = rows.filter((r) => chip === "all" || r.on === (chip === "active"));
  const about = approx ? "≈ " : "";

  return (
    <div className="subs-page">
      <header className="subs-head">
        <dl className="subs-totals">
          <div>
            <dt>Per month</dt>
            <dd className="num">
              {about}
              {formatMoney(total)}
            </dd>
          </div>
          <div>
            <dt>Per year</dt>
            <dd className="num">
              {about}
              {formatMoney(total * 12)}
            </dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd className="num">{active.length}</dd>
          </div>
          <div>
            <dt>Spent so far</dt>
            <dd className="num">{formatMoney(spent)}</dd>
          </div>
        </dl>
        <button type="button" className="btn primary" onClick={() => setOpen("new")}>
          <Icon name="plus" size={15} /> New subscription
        </button>
      </header>
      <div className="subs-bar">
        <fieldset className="chips">
          <legend className="sr">Show</legend>
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="btn"
              aria-pressed={chip === c}
              onClick={() => setChip(c)}
            >
              {CHIP_LABEL[c]} <span className="num muted">{count[c]}</span>
            </button>
          ))}
        </fieldset>
        <p role="status" className="muted" style={{ margin: 0 }}>
          {message}
        </p>
      </div>
      <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
        <table className="table subs-table" aria-label="Subscriptions">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num-col">Amount</th>
              <th>Every</th>
              <th className="num-col">Per month</th>
              <th>Next</th>
              <th>Since</th>
              <th className="num-col">Spent</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ doc, on, next, spent: paid, since }) => (
              <tr
                key={doc.id}
                className={on ? undefined : "paused"}
                {...rowOpen(() => setOpen(doc))}
              >
                <td>
                  <button type="button" className="link subs-name" onClick={() => setOpen(doc)}>
                    {titleOf(doc)}
                  </button>
                </td>
                <td className="num num-col">
                  {typeof doc.data.amount === "number" ? formatMoney(doc.data.amount) : "—"}
                </td>
                <td className="muted">{EVERY[str(doc.data.repeat)] ?? "once"}</td>
                <td className="num num-col">{on ? formatMoney(monthlyCost(doc)) : "—"}</td>
                <td>{on ? next ? day(next) : "—" : <span className="muted">Paused</span>}</td>
                <td className="muted">{since ? monthYear(since) : "—"}</td>
                <td className="num num-col">{paid > 0 ? formatMoney(paid) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="muted" style={{ margin: 0, padding: 14 }}>
            {rows.length === 0 ? "No subscriptions yet." : "Nothing here."}
          </p>
        )}
      </section>
      <p className="muted subs-note">
        Spent and Since come from your expenses: under Subscriptions with the same name, or linked
        to it. A reminder is a{" "}
        <a className="link" href={flowPath()}>
          flow
        </a>{" "}
        that starts “When a date arrives”.
      </p>
      {open && (
        <Sheet
          title={open === "new" ? "New subscription" : titleOf(open)}
          onClose={() => setOpen(undefined)}
        >
          <SubscriptionForm
            key={open === "new" ? "new" : open.id}
            {...(open === "new" ? {} : { doc: open })}
            onDone={(m) => {
              setMessage(m);
              setOpen(undefined);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
