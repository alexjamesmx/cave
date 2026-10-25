import { useMemo, useState } from "react";
import { monthName, monthOf, shiftMonth } from "../../../shared/dates.ts";
import { undatedSummary } from "../../../shared/money.ts";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { formatMoney } from "../logic/format.ts";
import {
  CHIPS,
  type Chip,
  GROUPS,
  type GroupBy,
  type LedgerGroup,
  type LedgerQuery,
  ledger,
  movementOf,
  queryFromSearch,
  queryToSearch,
} from "../logic/ledger.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { soleAccount } from "../ui/AccountPicker.tsx";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { OptionPicker } from "../ui/OptionPicker.tsx";
import { rowOpen } from "../ui/row-open.ts";

// The ledger can be long in "All time"; it renders in pages so the DOM stays small.
const PAGE = 200;

const CHIP_LABEL: Record<Chip, string> = {
  all: "All",
  expense: "Expenses",
  income: "Income",
  transfer: "Transfers",
  uncategorized: "Uncategorized",
};
const GROUP_LABEL: Record<GroupBy, string> = {
  day: "Day",
  category: "Category",
  account: "Account",
  none: "None",
};

/** A signed amount, coloured by what the money did: out, in, or between own accounts. */
function Amount({ doc, category }: { doc: Doc; category: Field | undefined }) {
  const amount = doc.data.amount;
  const move = movementOf(category, doc);
  if (typeof amount !== "number" || move === "incomplete") return <span className="muted">—</span>;
  if (move === "transfer")
    return (
      <span className="num" style={{ color: "var(--cyan)" }}>
        {formatMoney(amount)}
      </span>
    );
  const income = move === "income";
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

const timeOf = (date: unknown) => {
  const s = typeof date === "string" ? date : "";
  return s.length > 10 ? s.slice(11, 16) : "";
};

/**
 * Money → Transactions (M12 part 1): one month at a time (or all time), direction chips,
 * search, a searchable category filter, rows grouped by day, category or account with a
 * subtotal each, and the entry form in place. Undated entries stay on top, in no total.
 */
export function Transactions() {
  const { db } = useCave().local;
  const collections = useCollections(db);
  const items = useItems(db, "money");
  const today = useToday();
  const thisMonth = monthOf(today);
  const search = useSearch();
  const q = useMemo(() => queryFromSearch(search, thisMonth), [search, thisMonth]);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string>();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const stored = collections?.find((c) => c.id === "money");
  const collection = stored ? withActiveFields(stored) : undefined;
  const field = (id: string) => collection?.data.fields.find((f) => f.id === id);
  const category = field("category");
  const account = field("account");
  const sole = soleAccount(collections);
  const l = useMemo(() => ledger(items ?? [], q, category, account), [items, q, category, account]);
  if (!collection || !items) return null;

  const set = (patch: Partial<LedgerQuery>) =>
    setSearch(queryToSearch({ ...q, ...patch }, thisMonth));
  const lost = undatedSummary(l.undated);
  const columns = sole ? 4 : 5;
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const row = (doc: Doc, undatedRow: boolean) => (
    <tr key={doc.id} {...rowOpen(() => setOpen(doc.id))}>
      <td className="num">
        {undatedRow ? (
          <SetDate doc={doc} />
        ) : q.groupBy === "day" ? (
          <span className="muted">{timeOf(doc.data.date)}</span>
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
      {!sole && <td>{account && <FieldValue field={account} value={doc.data.account} />}</td>}
    </tr>
  );

  // Paging counts rows across groups, so "show more" reveals the next 200 wherever they fall.
  let budget = shown;
  const group = (g: LedgerGroup) => {
    if (budget <= 0) return null;
    const rows = g.rows.slice(0, budget);
    budget -= rows.length;
    const hidden = collapsed.has(g.key);
    return (
      <tbody key={g.key || "all"} aria-label={g.label || "Entries"}>
        {q.groupBy !== "none" && (
          <tr className="group-row">
            <td colSpan={columns}>
              <button type="button" onClick={() => toggle(g.key)} aria-expanded={!hidden}>
                <Icon name={hidden ? "chevron-right" : "chevron-down"} size={14} />
                <span>{g.label}</span>
                <span className="num muted">{g.rows.length}</span>
                <span className="num" style={{ marginLeft: "auto" }}>
                  {g.out > 0 && (
                    <span style={{ color: "var(--expense)" }}>−{formatMoney(g.out)}</span>
                  )}
                  {g.out > 0 && g.in > 0 && " · "}
                  {g.in > 0 && <span style={{ color: "var(--income)" }}>+{formatMoney(g.in)}</span>}
                </span>
              </button>
            </td>
          </tr>
        )}
        {!hidden && rows.map((d) => row(d, false))}
      </tbody>
    );
  };
  const net = l.totals.in - l.totals.out;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <header className="period-bar">
        <button
          type="button"
          className="btn"
          aria-label="Previous month"
          disabled={q.month === "all"}
          onClick={() => set({ month: shiftMonth(q.month, -1) })}
        >
          <Icon name="chevron-left" size={15} />
        </button>
        <h2 style={{ margin: 0, fontSize: 18, minWidth: 150 }}>
          {q.month === "all" ? "All time" : monthName(q.month)}
        </h2>
        <button
          type="button"
          className="btn"
          aria-label="Next month"
          disabled={q.month === "all" || q.month >= thisMonth}
          onClick={() => set({ month: shiftMonth(q.month, 1) })}
        >
          <Icon name="chevron-right" size={15} />
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={q.month === "all"}
          onClick={() => set({ month: q.month === "all" ? thisMonth : "all" })}
        >
          All time
        </button>
        <span className="ledger-totals num">
          <span style={{ color: "var(--income)" }}>+{formatMoney(l.totals.in)}</span>
          <span style={{ color: "var(--expense)" }}>−{formatMoney(l.totals.out)}</span>
          <span style={{ color: net >= 0 ? "var(--income)" : "var(--expense)" }}>
            net {net < 0 ? "−" : ""}
            {formatMoney(Math.abs(net))}
          </span>
          {l.totals.transferred > 0 && (
            <span style={{ color: "var(--cyan)" }}>{formatMoney(l.totals.transferred)} moved</span>
          )}
        </span>
        <button
          type="button"
          className="btn primary"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <Icon name="plus" size={15} /> New entry
        </button>
      </header>
      {adding && <MoneyForm keepOpen onSaved={(_, m) => setMessage(m)} />}
      <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
        {message}
      </p>
      <div className="ledger-controls">
        <fieldset className="chips">
          <legend className="sr">Show</legend>
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="btn"
              aria-pressed={q.chip === c}
              onClick={() => set({ chip: c })}
            >
              {CHIP_LABEL[c]}
            </button>
          ))}
        </fieldset>
        <input
          className="input"
          type="search"
          aria-label="Search transactions"
          placeholder="Search"
          value={q.text}
          onChange={(e) => set({ text: e.target.value })}
          style={{ flex: "1 1 140px", minWidth: 0 }}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="k">Group by</span>
          <select
            className="input"
            aria-label="Group by"
            value={q.groupBy}
            onChange={(e) => set({ groupBy: e.target.value as GroupBy })}
            style={{ width: "auto" }}
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <div style={{ flex: "0 1 200px" }}>
          <OptionPicker
            label="Category filter"
            options={category?.options ?? []}
            value={q.category}
            onChange={(value) => set({ category: value })}
            emptyLabel="Any category"
          />
        </div>
        {!sole && account && (
          <div style={{ flex: "0 1 180px" }}>
            <OptionPicker
              label="Account filter"
              options={account.options ?? []}
              value={q.account}
              onChange={(value) => set({ account: value })}
              emptyLabel="Any account"
            />
          </div>
        )}
      </div>
      <section className="panel" style={{ padding: 4, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>{q.groupBy === "day" ? "Time" : "Date"}</th>
              <th>Title</th>
              <th>Category</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              {!sole && <th>Account</th>}
            </tr>
          </thead>
          {l.undated.length > 0 && (
            <tbody aria-label="Undated">
              <tr className="group-row">
                <td colSpan={columns}>
                  Undated · {lost.count} · {formatMoney(lost.amount)} in no total until dated
                </td>
              </tr>
              {l.undated.map((d) => row(d, true))}
            </tbody>
          )}
          {l.groups.map(group)}
        </table>
        <div style={{ padding: 12 }}>
          <span className="num muted" style={{ fontSize: 12 }}>
            {l.totals.count === 0
              ? "Nothing here."
              : `${Math.min(shown, l.totals.count)} of ${l.totals.count}`}
            {l.totals.count > shown && (
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
