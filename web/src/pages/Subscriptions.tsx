import { type CSSProperties, useMemo, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { offeredOptions } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { expenseFrom, isActive, PAYMENTS, paidPatch } from "../../../shared/payments.ts";
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
import { oncePerKey } from "../app/once.ts";
import { showToast } from "../app/toast.ts";
import { formatMoney } from "../logic/format.ts";
import { paidEntry } from "../logic/subscription-paid.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { MarkTile, OptionTile } from "../ui/OptionTile.tsx";
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
const tint = (color: string) => ({ "--c": color }) as CSSProperties;
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
 * Money → Subscriptions (M14): what runs and what it costs a month and a year, then one card
 * each with its history (spent, since the first charge) from the real expenses. Paid logs this
 * charge as a linked expense in one tap (the money form asks when the amount varies) and moves
 * it to its next date; Undo takes both back. A card opens it to edit, pause or delete.
 */
export function Subscriptions() {
  const { local } = useCave();
  const payments = useItems(local.db, PAYMENTS);
  const money = useItems(local.db, "money");
  const fields = useCollections(local.db)?.find((c) => c.id === "money")?.data.fields;
  const zone = useReminderZone();
  const now = useNow().getTime();
  const [chip, setChip] = useState<Chip>("active");
  const [open, setOpen] = useState<Doc | "new">();
  const [paying, setPaying] = useState<Doc>();
  const [once] = useState(oncePerKey);

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
  const listOf = (id: string) => {
    const field = fields?.find((f) => f.id === id);
    return field ? offeredOptions(field) : [];
  };
  const categoryOf = (value: unknown) =>
    fields?.find((f) => f.id === "category")?.options?.find((o) => o.value === value);
  const active = rows.filter((r) => r.on);
  const { total, approx } = monthlyTotal(active.map((r) => r.doc));
  const spent = rows.reduce((sum, r) => sum + r.spent, 0);
  const count = { active: active.length, paused: rows.length - active.length, all: rows.length };
  const shown = rows.filter((r) => chip === "all" || r.on === (chip === "active"));
  const about = approx ? "≈ " : "";

  /** The charge is logged; the subscription moves to its next date, as `mark_paid` does. */
  const moveOn = async (sub: Doc, expense: string, amount: number | undefined) => {
    const patch = paidPatch(sub, Date.now(), zone);
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, sub.data[k] ?? null]));
    await local.write({ id: sub.id, kind: "item", collection: PAYMENTS }, patch);
    showToast({
      message: `Paid · ${titleOf(sub)}${amount === undefined ? "" : ` · ${formatMoney(amount)}`}`,
      undo: async () => {
        await local.write({ id: expense, kind: "item", collection: "money" }, { _deleted: true });
        await local.write({ id: sub.id, kind: "item", collection: PAYMENTS }, before);
      },
    });
  };
  const paid = (sub: Doc) => {
    const date = localDateTime(new Date(), zone.timeZone);
    const entry = paidEntry(sub, listOf("category"), listOf("account"), date);
    if (!entry) return setPaying(sub);
    once(sub.id, async () => {
      const id = newId();
      await local.write({ id, kind: "item", collection: "money" }, entry);
      await moveOn(sub, id, entry.amount as number);
    });
  };

  return (
    <div className="ms-page">
      <section className="ms-totals" aria-label="Totals">
        <div className="panel m-stat">
          <span className="m-label">Per month</span>
          <span className="m-big num">
            {about}
            {formatMoney(total)}
          </span>
        </div>
        <div className="panel m-stat">
          <span className="m-label">Per year</span>
          <span className="m-big num">
            {about}
            {formatMoney(total * 12)}
          </span>
        </div>
        <div className="panel m-stat">
          <span className="m-label">Active</span>
          <span className="m-big num">{active.length}</span>
        </div>
        <div className="panel m-stat">
          <span className="m-label">Spent so far</span>
          <span className="m-big num out">{formatMoney(spent)}</span>
        </div>
      </section>
      <div className="ms-bar">
        <fieldset className="tx-chips">
          <legend className="sr">Show</legend>
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="pill"
              aria-pressed={chip === c}
              onClick={() => setChip(c)}
            >
              {CHIP_LABEL[c]} <span className="mc-n num">{count[c]}</span>
            </button>
          ))}
        </fieldset>
        <button type="button" className="btn primary" onClick={() => setOpen("new")}>
          <Icon name="plus" size={15} /> New subscription
        </button>
      </div>
      <ul className="panel ms-list" aria-label="Subscriptions">
        {shown.map(({ doc, on, next, spent: paidSoFar, since }) => {
          const c = categoryOf(doc.data.category);
          const amount = typeof doc.data.amount === "number" ? doc.data.amount : undefined;
          const every = EVERY[str(doc.data.repeat)] ?? "once";
          return (
            <li
              key={doc.id}
              className={`ms-row${on ? "" : " paused"}`}
              style={tint(c?.color ?? "var(--s-cyan)")}
              {...rowOpen(() => setOpen(doc))}
            >
              {c ? <OptionTile option={c} /> : <MarkTile mark="🔁" />}
              <div className="ms-what">
                <button type="button" className="link ms-name" onClick={() => setOpen(doc)}>
                  {titleOf(doc)}
                </button>
                <span className="m-note num">
                  {amount === undefined
                    ? "—"
                    : `${doc.data.approx === true ? "≈ " : ""}${formatMoney(amount)}`}{" "}
                  a {every} · {on ? (next ? `next ${day(next)}` : "no date") : "Paused"}
                </span>
              </div>
              <span className="ms-cell ms-month">
                <span className="m-note">Per month</span>
                <span className="num">{on ? formatMoney(monthlyCost(doc)) : "—"}</span>
              </span>
              <span className="ms-cell ms-spent">
                <span className="m-note">Spent{since ? ` since ${monthYear(since)}` : ""}</span>
                <span className="num">{paidSoFar > 0 ? formatMoney(paidSoFar) : "—"}</span>
              </span>
              <span className="ms-act">
                {on && (
                  <button type="button" className="btn" onClick={() => paid(doc)}>
                    <Icon name="check" size={15} /> Paid
                  </button>
                )}
              </span>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="m-note ms-empty">
            {rows.length === 0 ? "No subscriptions yet." : "Nothing here."}
          </li>
        )}
      </ul>
      {open && (
        <Sheet
          title={open === "new" ? "New subscription" : titleOf(open)}
          onClose={() => setOpen(undefined)}
        >
          <SubscriptionForm
            key={open === "new" ? "new" : open.id}
            {...(open === "new" ? {} : { doc: open })}
            onDone={(m) => {
              showToast({ message: m });
              setOpen(undefined);
            }}
          />
        </Sheet>
      )}
      {paying && (
        <Sheet title={`Paid · ${titleOf(paying)}`} onClose={() => setPaying(undefined)}>
          <MoneyForm
            prefill={{ ...expenseFrom(paying), payment: paying.id }}
            submitLabel="Save and mark paid"
            onSaved={(expense) => {
              const sub = paying;
              setPaying(undefined);
              void moveOn(sub, expense, undefined);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
