import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { categoryChoices, optionText } from "../../../shared/categories.ts";
import { monthOf } from "../../../shared/dates.ts";
import { undatedSummary } from "../../../shared/money.ts";
import type { Field, SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { formatMoney, percent } from "../logic/format.ts";
import {
  CHIPS,
  type Chip,
  canStepForward,
  dayLabel,
  isUncategorized,
  isYearScope,
  type LedgerDay,
  type LedgerQuery,
  ledger,
  movementOf,
  queryFromSearch,
  queryToSearch,
  scopeLabel,
  stepScope,
  switchScope,
} from "../logic/ledger.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { OptionPicker } from "../ui/OptionPicker.tsx";
import { MarkTile, OptionTile } from "../ui/OptionTile.tsx";
import { rowOpen } from "../ui/row-open.ts";
import { Sheet } from "../ui/Sheet.tsx";

// A year can be long; the list renders in pages so the DOM stays small.
const PAGE = 200;

const CHIP_LABEL: Record<Chip, string> = {
  all: "All",
  expense: "Expenses",
  income: "Income",
  review: "To review",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const tint = (color: string) => ({ "--c": color }) as CSSProperties;
const timeOf = (date: unknown) => {
  const s = str(date);
  return s.length > 10 ? s.slice(11, 16) : "";
};

/** A signed amount, coloured by what the money did: out, in, or between own accounts. */
function Amount({ doc, category }: { doc: Doc; category: Field | undefined }) {
  const amount = doc.data.amount;
  const move = movementOf(category, doc);
  if (typeof amount !== "number" || move === "incomplete") return <span className="muted">—</span>;
  if (move === "transfer") return <span className="num move">{formatMoney(amount)}</span>;
  const income = move === "income";
  return (
    <span className={`num ${income ? "in" : "out"}`}>
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
      <button type="button" className="tx-pick" onClick={() => setOpen(true)}>
        Set date
      </button>
    );
  return (
    <span className="tx-set-date" data-row-control="">
      <input
        className="input"
        type="datetime-local"
        aria-label={`Date for ${titleOf(doc)}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="button"
        className="btn"
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

/** "+ Pick category" in a row: the searchable picker in place, writing the choice at once. */
function PickCategory({ doc, field, label }: { doc: Doc; field: Field; label: string }) {
  const { local } = useCave();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (open) box.current?.querySelector("input")?.focus();
  }, [open]);
  if (!open)
    return (
      <button type="button" className="tx-pick" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <fieldset
      ref={box}
      className="tx-pick-open"
      data-row-control=""
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <legend className="sr">Category for {titleOf(doc)}</legend>
      <OptionPicker
        label={`Category for ${titleOf(doc)}`}
        options={categoryChoices(field.options ?? [], doc.data.direction, undefined)}
        value=""
        allowEmpty={false}
        placeholder="Type a category"
        onChange={(value) => {
          setOpen(false);
          if (value)
            void local.write(
              { id: doc.id, kind: "item", collection: "money" },
              { category: value },
            );
        }}
      />
    </fieldset>
  );
}

function Row({
  doc,
  category,
  account,
  undated,
  onOpen,
}: {
  doc: Doc;
  category: Field | undefined;
  account: Field | undefined;
  undated: boolean;
  onOpen(): void;
}) {
  const c = category?.options?.find((o) => o.value === doc.data.category);
  const a = account?.options?.find((o) => o.value === doc.data.account);
  const noCategory = !category || isUncategorized(category, doc.data.category);
  const noAccount = isUncategorized(account, doc.data.account);
  const accountText = a ? optionText(a) : str(doc.data.account);
  const time = timeOf(doc.data.date);
  const pick = (label: string) =>
    category ? <PickCategory doc={doc} field={category} label={label} /> : null;
  return (
    <li
      className={`tx-row${noCategory || noAccount ? " review" : ""}`}
      style={tint(c?.color ?? "var(--warn)")}
      {...rowOpen(onOpen)}
    >
      {c ? <OptionTile option={c} /> : <MarkTile mark="❔" />}
      <div className="tx-what">
        <button type="button" className="link tx-title" onClick={onOpen}>
          {titleOf(doc)}
        </button>
        <div className="tx-sub">
          <span className="tx-when">
            {undated ? <SetDate doc={doc} /> : time}
            {typeof doc.data.payment === "string" && " · subscription"}
          </span>
          <span className="tx-line">
            {noCategory ? pick("Tap to pick a category") : c ? c.label || c.value : ""}
            {" · "}
            {noAccount ? <span className="tx-warn">No account</span> : accountText}
          </span>
        </div>
      </div>
      <span className="tx-cat">
        {noCategory ? (
          pick("+ Pick category")
        ) : (
          <span className={`tx-chip${c?.archived ? " archived" : ""}`}>
            {c?.emoji && <span aria-hidden="true">{c.emoji}</span>}
            {c && (c.label || c.value)}
          </span>
        )}
      </span>
      <span className="tx-acct">
        {noAccount ? <span className="tx-warn">No account</span> : accountText}
      </span>
      <span className="tx-amt">
        <Amount doc={doc} category={category} />
        <span className="tx-when-phone">{time}</span>
      </span>
    </li>
  );
}

/** The day's net: what came in less what went out; transfers move nothing. */
function DayTotal({ day }: { day: LedgerDay }) {
  const net = day.in - day.out;
  if (net === 0) return null;
  return (
    <span className={`num ${net > 0 ? "in" : "out"}`}>
      {net > 0 ? "+" : "−"}
      {formatMoney(Math.abs(net))}
    </span>
  );
}

/** The scope's summary: what came in, what went out, and what is left, with the split. */
function Summary({
  totals,
  labelOf,
}: {
  totals: ReturnType<typeof ledger>["totals"];
  labelOf(value: string): string;
}) {
  const left = totals.in - totals.out;
  const outShare = totals.in > 0 ? Math.min(totals.out / totals.in, 1) : totals.out > 0 ? 1 : 0;
  const plural = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
  return (
    <section className="tx-sum" aria-label="Summary">
      <div className="m-stat tx-in">
        <span className="m-label">Came in</span>
        <span className="m-big num in">+{formatMoney(totals.in)}</span>
        <span className="m-note">
          {plural(totals.inCount)}
          {totals.inCategories.length > 0 &&
            ` · ${totals.inCategories.slice(0, 2).map(labelOf).join(", ")}`}
        </span>
      </div>
      <div className="m-stat tx-out">
        <span className="m-label">Went out</span>
        <span className="m-big num out">−{formatMoney(totals.out)}</span>
        <span className="m-note">
          {plural(totals.outCount)}
          {totals.in > 0 && ` · ${percent(totals.out, totals.in)} of what came in`}
        </span>
      </div>
      <div className="m-stat tx-left">
        <span className="m-label">Left</span>
        <span className={`m-big num${left < 0 ? " out" : ""}`}>
          {left < 0 ? "−" : "+"}
          {formatMoney(Math.abs(left))}
        </span>
        <span className="m-split" aria-hidden="true">
          <span className="out" style={{ width: `${outShare * 100}%` }} />
          {totals.in > 0 && <span className="in" style={{ width: `${(1 - outShare) * 100}%` }} />}
        </span>
      </div>
    </section>
  );
}

/**
 * Money → Transactions (M14): a month or a year (1 January to today), what came in, went out
 * and is left, one search over every field, the direction chips and To review, and the
 * entries by day on a fixed grid (cards on a phone). A row opens its editor; an
 * uncategorized one picks its category in place. Undated entries stay on top, in no total.
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

  const stored = collections?.find((c) => c.id === "money");
  const collection = stored ? withActiveFields(stored) : undefined;
  const field = (id: string) => collection?.data.fields.find((f) => f.id === id);
  const category = field("category");
  const account = field("account");
  const l = useMemo(
    () => ledger(items ?? [], q, category, account, today),
    [items, q, category, account, today],
  );
  const toReview = useMemo(() => {
    const r = ledger(items ?? [], { ...q, chip: "review", text: "" }, category, account, today);
    return r.totals.count + r.undated.length;
  }, [items, q, category, account, today]);
  if (!collection || !items) return null;

  const set = (patch: Partial<LedgerQuery>) =>
    setSearch(queryToSearch({ ...q, ...patch }, thisMonth));
  const year = isYearScope(q.month);
  const unit = year ? "year" : "month";
  const optionOf = (value: string): SelectOption | undefined =>
    category?.options?.find((o) => o.value === value);
  const labelOf = (value: string) => {
    const o = optionOf(value);
    return o ? o.label || o.value : value;
  };
  const filtered = q.category ? optionOf(q.category) : undefined;
  const lost = undatedSummary(l.undated);
  const row = (doc: Doc, undated: boolean) => (
    <Row
      key={doc.id}
      doc={doc}
      category={category}
      account={account}
      undated={undated}
      onOpen={() => setOpen(doc.id)}
    />
  );

  // Paging counts rows across days, so "show more" reveals the next 200 wherever they fall.
  let budget = shown;
  const days = l.days.flatMap((d) => {
    if (budget <= 0) return [];
    const rows = d.rows.slice(0, budget);
    budget -= rows.length;
    return [{ ...d, rows }];
  });

  return (
    <div className="tx-page">
      <div className="m-scope">
        <fieldset className="m-seg">
          <legend className="sr">Scope</legend>
          {(["month", "year"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={(k === "year") === year}
              onClick={() => set({ month: switchScope(q.month, k, thisMonth) })}
            >
              {k === "month" ? "Month" : "Year"}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Previous ${unit}`}
          onClick={() => set({ month: stepScope(q.month, -1) })}
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <h2 className="m-scope-label">{scopeLabel(q.month)}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Next ${unit}`}
          disabled={!canStepForward(q.month, thisMonth)}
          onClick={() => set({ month: stepScope(q.month, 1) })}
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      <Summary totals={l.totals} labelOf={labelOf} />

      <div className="tx-tools">
        <label className="tx-search">
          <span aria-hidden="true">🔎</span>
          <input
            type="search"
            aria-label="Search transactions"
            placeholder="Search anything: title, category, account, amount, note"
            value={q.text}
            onChange={(e) => set({ text: e.target.value })}
          />
        </label>
        <fieldset className="tx-chips">
          <legend className="sr">Show</legend>
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="pill"
              aria-pressed={q.chip === c}
              onClick={() => set({ chip: c })}
            >
              {CHIP_LABEL[c]}
              {c === "review" && toReview > 0 && <span className="count num">{toReview}</span>}
            </button>
          ))}
          {q.category && (
            <button
              type="button"
              className="pill"
              aria-pressed="true"
              aria-label="Clear category filter"
              onClick={() => set({ category: "" })}
            >
              {filtered ? optionText(filtered) : q.category} ✕
            </button>
          )}
        </fieldset>
        <button type="button" className="btn primary tx-new" onClick={() => setAdding(true)}>
          <Icon name="plus" size={15} /> New entry
        </button>
      </div>

      <section className="panel tx-list" aria-label={`${scopeLabel(q.month)} entries`}>
        {l.undated.length > 0 && (
          <section className="tx-day" aria-label="Undated">
            <header className="tx-day-head">
              <span>
                Undated · {lost.count} · {formatMoney(lost.amount)} in no total until dated
              </span>
            </header>
            <ul>{l.undated.map((d) => row(d, true))}</ul>
          </section>
        )}
        {days.map((d) => {
          const label = dayLabel(d.day, today, year);
          return (
            <section key={d.day} className="tx-day" aria-label={label}>
              <header className="tx-day-head">
                <span>{label}</span>
                <DayTotal day={d} />
              </header>
              <ul>{d.rows.map((doc) => row(doc, false))}</ul>
            </section>
          );
        })}
        <p className="tx-foot num">
          {l.totals.count === 0
            ? "Nothing here."
            : `${Math.min(shown, l.totals.count)} of ${l.totals.count}`}
          {l.totals.count > shown && (
            <button type="button" className="link" onClick={() => setShown(shown + PAGE)}>
              {" "}
              · show more
            </button>
          )}
        </p>
      </section>

      {adding && (
        <Sheet
          title="New entry"
          onClose={() => {
            setAdding(false);
            setMessage(undefined);
          }}
        >
          <MoneyForm keepOpen onSaved={(_, m) => setMessage(m)} />
          <p role="status" className="muted tx-saved">
            {message}
          </p>
        </Sheet>
      )}
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
