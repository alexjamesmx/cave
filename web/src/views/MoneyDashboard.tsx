import { type FormEvent, useMemo, useState } from "react";
import { localDateTime, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { monthSummary, undatedEntries } from "../../../shared/money.ts";
import { useSaver, useTimeZone, useToday } from "../app/hooks.ts";
import { collectionPath } from "../app/router.ts";
import { formatMoney, percent, signedMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { BarRow, Columns, Stat } from "../ui/charts.tsx";
import { Icon } from "../ui/icon.tsx";
import type { ViewProps } from "./types.ts";

export function MoneyDashboard({ collection, items, open }: ViewProps) {
  const today = useToday();
  const [month, setMonth] = useState(() => monthOf(today));
  const s = useMemo(() => monthSummary(items, month, today), [items, month, today]);
  const undated = useMemo(() => undatedEntries(items).length, [items]);
  const category = collection.data.fields.find((f) => f.id === "category");
  const colorOf = (value: string | null) =>
    category?.options?.find((o) => o.value === value)?.color ?? "var(--muted)";
  const peak = s.byDay.indexOf(Math.max(...s.byDay));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <QuickEntry
        collection={collection.id}
        categories={category?.options?.map((o) => o.value) ?? []}
      />
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="btn"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <Icon name="chevron-left" size={15} />
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{monthName(month)}</h2>
        <button
          type="button"
          className="btn"
          aria-label="Next month"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <Icon name="chevron-right" size={15} />
        </button>
      </header>
      {(s.incomplete.length > 0 || undated > 0) && (
        <p role="status" className="panel banner" style={{ margin: 0 }}>
          {s.incomplete.length > 0 &&
            `${s.incomplete.length} entr${s.incomplete.length === 1 ? "y" : "ies"} this month ${s.incomplete.length === 1 ? "has" : "have"} no amount or direction and ${s.incomplete.length === 1 ? "is" : "are"} not in these totals. `}
          {undated > 0 && `${undated} entr${undated === 1 ? "y has" : "ies have"} no date. `}
          <a href={collectionPath(collection.id, "table")}>Open the table</a>
        </p>
      )}
      <div className="stats">
        <Stat
          label="Income"
          value={signedMoney(s.income, "income")}
          note={`${s.incomeCount} entries`}
          tone="var(--income)"
        />
        <Stat
          label="Spent"
          value={signedMoney(s.spent, "expense")}
          note={`${s.spentCount} entries`}
          tone="var(--expense)"
        />
        <Stat
          label="Net"
          value={signedMoney(s.net, s.net >= 0 ? "income" : "expense")}
          note="income − spent"
        />
        <Stat
          label="Burn rate"
          value={s.burnPerDay === undefined ? "—" : `${formatMoney(Math.round(s.burnPerDay))}/day`}
          note={s.daysElapsed > 0 ? `${s.daysElapsed} days` : "not started"}
        />
      </div>
      <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <span className="k">
          Daily spending
          {s.spent > 0 &&
            ` · peak ${shortDay(`${month}-${String(peak + 1).padStart(2, "0")}`)} ${formatMoney(s.byDay[peak] ?? 0)}`}
        </span>
        <Columns
          label={`Spending per day in ${monthName(month)}`}
          values={s.byDay}
          labels={s.byDay.map(
            (v, i) =>
              `${shortDay(`${month}-${String(i + 1).padStart(2, "0")}`)}: ${formatMoney(v)}`,
          )}
          color="var(--expense)"
          {...(month === monthOf(today) ? { highlight: Number(today.slice(8)) - 1 } : {})}
        />
      </section>
      <div className="split">
        <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
          <span className="k">Where it went</span>
          {s.byCategory.length === 0 && <span className="muted">No spending this month.</span>}
          {s.byCategory.map(({ category: c, amount }) => (
            <BarRow
              key={c ?? "__untagged"}
              label={c ? c : <a href={collectionPath(collection.id, "untagged")}>? untagged</a>}
              value={`${formatMoney(amount)} · ${percent(amount, s.spent)}`}
              share={s.spent === 0 ? 0 : amount / s.spent}
              color={colorOf(c)}
            />
          ))}
        </section>
        <section className="panel" style={{ padding: 16, display: "grid", gap: 4 }}>
          <span className="k">Largest</span>
          {[...s.expenses.slice(0, 6), ...s.incomes.slice(0, 2)].map((e) => (
            <button key={e.doc.id} type="button" className="entry" onClick={() => open(e.doc.id)}>
              <span style={{ flex: 1, textAlign: "left" }}>
                {e.category === null && <span className="chip untagged">tag me</span>}{" "}
                {titleOf(e.doc)}
              </span>
              <span className="num muted" style={{ fontSize: 12 }}>
                {shortDay(e.day)}
              </span>
              <span
                className="num"
                style={{ color: e.direction === "income" ? "var(--income)" : "var(--expense)" }}
              >
                {signedMoney(e.amount, e.direction)}
              </span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

/** Amount and name with an explicit category; category stays empty unless the owner picks one. */
function QuickEntry({ collection, categories }: { collection: string; categories: string[] }) {
  const timeZone = useTimeZone();
  const saver = useSaver(collection);
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [income, setIncome] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value <= 0) return;
    const id = await saver.create({
      _title: title.trim(),
      amount: value,
      direction: income ? "income" : "expense",
      date: localDateTime(new Date(), timeZone),
      ...(category ? { category } : {}),
    });
    if (id) {
      setAmount("");
      setTitle("");
      setCategory("");
    }
  };

  return (
    <form className="panel quick" onSubmit={submit}>
      <button
        type="button"
        className="btn"
        aria-pressed={income}
        onClick={() => setIncome(!income)}
        style={{ color: income ? "var(--income)" : "var(--expense)" }}
      >
        {income ? "+ income" : "− expense"}
      </button>
      <input
        className="input num"
        aria-label="Amount"
        inputMode="decimal"
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: 110 }}
      />
      <input
        className="input"
        aria-label="Name"
        placeholder="What was it?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1 }}
      />
      <select
        className="input"
        aria-label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">Category…</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button type="submit" className="btn primary">
        Add
      </button>
      {saver.error && (
        <span role="alert" className="error">
          {saver.error}
        </span>
      )}
    </form>
  );
}
