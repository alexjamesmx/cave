import { useEffect, useMemo, useState } from "react";
import { kindOf, optionText } from "../../../shared/categories.ts";
import { dayOf } from "../../../shared/dates.ts";
import { undatedSummary } from "../../../shared/money.ts";
import type { Field } from "../../../shared/schema.ts";
import { dismissedOf, subscriptionProposals } from "../../../shared/subscription-finder.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { ownerGet } from "../app/owner-api.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useDoc, useItems } from "../store/queries.ts";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { rowOpen } from "../ui/row-open.ts";

// The ledger is long; it renders in pages so the DOM stays small.
const PAGE = 200;

/** A signed amount, coloured by what the money did: out, in, or between own accounts. */
function Amount({ doc, category }: { doc: Doc; category: Field | undefined }) {
  const amount = doc.data.amount;
  if (typeof amount !== "number") return <span className="muted">—</span>;
  if (kindOf(category, doc.data.category) === "transfer")
    return (
      <span className="num" style={{ color: "var(--cyan)" }}>
        {formatMoney(amount)}
      </span>
    );
  const income = doc.data.direction === "income";
  return (
    <span className="num" style={{ color: income ? "var(--income)" : "var(--expense)" }}>
      {income ? "+" : "−"}
      {formatMoney(amount)}
    </span>
  );
}

/** Undated transactions keep no date until the owner sets one here. */
function SetDate({ doc }: { doc: Doc }) {
  const { local } = useCave();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Set date
      </button>
    );
  return (
    <span style={{ display: "flex", gap: 6 }} data-row-control="">
      <input
        className="input"
        type="datetime-local"
        aria-label={`Date for ${titleOf(doc)}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="button"
        className="btn primary"
        disabled={!value}
        onClick={() =>
          void local.write({ id: doc.id, kind: "item", collection: "money" }, { date: value })
        }
      >
        Save
      </button>
    </span>
  );
}

/** Money → Transactions: every entry, undated ones first, newest first after that. */
export function Transactions() {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, "money");
  const payments = useItems(db, "payments");
  const settings = useDoc(db, "settings");
  const search = useSearch();
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string>();
  const [toReview, setToReview] = useState<number>();
  useEffect(() => {
    void ownerGet<{ proposals: unknown[] }>("/api/money-review").then((r) =>
      setToReview(r?.proposals.length),
    );
  }, []);

  const params = new URLSearchParams(search);
  const text = params.get("q") ?? "";
  const categoryFilter = params.get("category") ?? "";
  const accountFilter = params.get("account") ?? "";
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    setSearch(s ? `?${s}` : "");
  };

  const rows = useMemo(() => {
    const needle = text.toLowerCase();
    return (items ?? [])
      .filter((d) => !needle || titleOf(d).toLowerCase().includes(needle))
      .filter((d) => !categoryFilter || d.data.category === categoryFilter)
      .filter((d) => !accountFilter || d.data.account === accountFilter)
      .sort((a, b) => String(b.data.date ?? "").localeCompare(String(a.data.date ?? "")));
  }, [items, text, categoryFilter, accountFilter]);

  const subscriptions = useMemo(
    () =>
      items && payments
        ? subscriptionProposals(items, payments, dismissedOf(settings?.data)).reduce(
            (n, p) => n + p.charges.length,
            0,
          )
        : 0,
    [items, payments, settings],
  );
  const pending = (toReview ?? 0) + subscriptions;
  const stored = collections?.find((c) => c.id === "money");
  if (!stored || !items) return null;
  const collection = withActiveFields(stored);
  const field = (id: string) => collection.data.fields.find((f) => f.id === id);
  const category = field("category");
  const account = field("account");
  const undated = rows.filter((d) => dayOf(d.data.date) === undefined);
  const dated = rows.filter((d) => dayOf(d.data.date) !== undefined);
  const lost = undatedSummary(undated);

  const row = (doc: Doc, undatedRow: boolean) => (
    <tr key={doc.id} {...rowOpen(() => setOpen(doc.id))}>
      <td className="num">
        {undatedRow ? (
          <SetDate doc={doc} />
        ) : (
          <FieldValue field={field("date") as Field} value={doc.data.date} />
        )}
      </td>
      <td>
        <button type="button" className="link" onClick={() => setOpen(doc.id)}>
          {titleOf(doc)}
        </button>
      </td>
      <td>{category && <OptionChip field={category} value={doc.data.category} />}</td>
      <td style={{ textAlign: "right" }}>
        <Amount doc={doc} category={category} />
      </td>
      <td>{account && <FieldValue field={account} value={doc.data.account} />}</td>
    </tr>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {pending > 0 && (
        <p className="panel banner" style={{ margin: 0 }}>
          <span>
            {pending} transaction{pending === 1 ? "" : "s"} to review
          </span>
          <a className="btn" href="/money/review">
            Review
          </a>
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn primary" onClick={() => setAdding(!adding)}>
          New transaction
        </button>
        <input
          className="input"
          type="search"
          aria-label="Search transactions"
          placeholder="Search"
          value={text}
          onChange={(e) => filter("q", e.target.value)}
          style={{ flex: "1 1 160px", minWidth: 0 }}
        />
        <select
          className="input"
          aria-label="Category"
          value={categoryFilter}
          onChange={(e) => filter("category", e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Any category</option>
          {category?.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {optionText(o)}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Account"
          value={accountFilter}
          onChange={(e) => filter("account", e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Any account</option>
          {account?.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {optionText(o)}
            </option>
          ))}
        </select>
      </div>
      {adding && (
        <MoneyForm
          onSaved={(_, m) => {
            setAdding(false);
            setMessage(m);
          }}
        />
      )}
      <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
        {message}
      </p>
      <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Category</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Account</th>
            </tr>
          </thead>
          {undated.length > 0 && (
            <tbody aria-label="Undated">
              <tr>
                <th colSpan={5} className="k" style={{ textAlign: "left" }}>
                  Undated · {lost.count} · {formatMoney(lost.amount)} in no total until dated
                </th>
              </tr>
              {undated.map((d) => row(d, true))}
            </tbody>
          )}
          <tbody>{dated.slice(0, shown).map((d) => row(d, false))}</tbody>
        </table>
        <div style={{ padding: 12 }}>
          <span className="num muted" style={{ fontSize: 12 }}>
            {Math.min(shown, dated.length)} of {dated.length} dated
            {dated.length > shown && (
              <button type="button" className="link" onClick={() => setShown(shown + PAGE)}>
                {" "}
                · show more
              </button>
            )}
          </span>
        </div>
      </section>
      {open && (
        <ItemDrawer
          key={open}
          collection={collection}
          id={open}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}
