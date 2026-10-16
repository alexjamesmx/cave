import { useMemo, useState } from "react";
import { optionText, transferCategories } from "../../../shared/categories.ts";
import { monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { monthSummary, undatedEntries } from "../../../shared/money.ts";
import { useToday } from "../app/hooks.ts";
import { collectionPath } from "../app/router.ts";
import { formatMoney, percent, signedMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { BarRow, Columns, Stat } from "../ui/charts.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import type { ViewProps } from "./types.ts";

export function MoneyDashboard({ collection, items, open }: ViewProps) {
  const today = useToday();
  const [month, setMonth] = useState(() => monthOf(today));
  const category = collection.data.fields.find((f) => f.id === "category");
  const s = useMemo(
    () => monthSummary(items, month, today, transferCategories(category)),
    [items, month, today, category],
  );
  const undated = useMemo(() => undatedEntries(items).length, [items]);
  const [adding, setAdding] = useState(false);
  const labelOf = (value: string) => {
    const o = category?.options?.find((x) => x.value === value);
    return o ? optionText(o) : value;
  };
  const colorOf = (value: string | null) =>
    category?.options?.find((o) => o.value === value)?.color ?? "var(--muted)";
  const peak = s.byDay.indexOf(Math.max(...s.byDay));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" onClick={() => setAdding(!adding)}>
          <Icon name="plus" size={15} /> New entry
        </button>
        <a className="btn" href="/money/review">
          <Icon name="list-checks" size={15} /> Review categories
        </a>
      </div>
      {adding && <MoneyForm onSaved={() => setAdding(false)} />}
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
          label="Transfers"
          value={formatMoney(s.transferred)}
          note={`${s.transfers.length} moves, not spending`}
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
              label={
                c ? labelOf(c) : <a href={collectionPath(collection.id, "untagged")}>? untagged</a>
              }
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
