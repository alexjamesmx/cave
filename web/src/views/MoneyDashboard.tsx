import { useMemo, useState } from "react";
import { optionText, transferCategories } from "../../../shared/categories.ts";
import { monthName, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { undatedEntries } from "../../../shared/money.ts";
import {
  currentPeriod,
  filterEntries,
  filterFromSearch,
  filterToSearch,
  fixedVsVariable,
  lastTwelve,
  type MoneyFilter,
  type PeriodSummary,
  periodSummary,
  previousPeriod,
  topTitles,
} from "../../../shared/money-stats.ts";
import { PAYMENTS } from "../../../shared/payments.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { collectionPath, setSearch, useSearch } from "../app/router.ts";
import { formatMoney, percent, signedMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { BarRow, Columns, PairColumns, RateLine, Stat } from "../ui/charts.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import type { ViewProps } from "./types.ts";

type Kind = "month" | "year";

const periodLabel = (p: { kind: Kind; key: string }) =>
  p.kind === "month" ? monthName(p.key) : p.key;
const change = (now: number, before: number) =>
  before === 0
    ? now === 0
      ? "no change"
      : "new"
    : `${now >= before ? "+" : "−"}${Math.round((Math.abs(now - before) / before) * 100)}%`;

export function MoneyDashboard({ collection, items, open }: ViewProps) {
  const today = useToday();
  const { local } = useCave();
  const payments = useItems(local.db, PAYMENTS) ?? [];
  const search = useSearch();
  const filter = useMemo(() => filterFromSearch(search), [search]);
  const [period, setPeriod] = useState<{ kind: Kind; key: string }>(() => ({
    kind: "month",
    key: currentPeriod("month", today),
  }));
  const [compare, setCompare] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string | null>();
  const category = collection.data.fields.find((f) => f.id === "category");
  const transfers = useMemo(() => transferCategories(category), [category]);
  const filtered = useMemo(() => filterEntries(items, filter), [items, filter]);
  const s = useMemo(
    () => periodSummary(filtered, period, today, transfers),
    [filtered, period, today, transfers],
  );
  const prev = useMemo(
    () => (compare ? periodSummary(filtered, previousPeriod(period), today, transfers) : undefined),
    [compare, filtered, period, today, transfers],
  );
  const endMonth = period.kind === "month" ? period.key : `${period.key}-12`;
  const trendCategory = picked === undefined ? (s.byCategory[0]?.category ?? null) : picked;
  const trend = useMemo(
    () => lastTwelve(filtered, endMonth, today, transfers, trendCategory),
    [filtered, endMonth, today, transfers, trendCategory],
  );
  const undated = useMemo(() => undatedEntries(items).length, [items]);
  const labelOf = (value: string | null) => {
    if (value === null) return "? untagged";
    const o = category?.options?.find((x) => x.value === value);
    return o ? optionText(o) : value;
  };
  const colorOf = (value: string | null) =>
    category?.options?.find((o) => o.value === value)?.color ?? "var(--muted)";
  const fixed = fixedVsVariable(s.expenses, payments);
  const titles = topTitles(s.expenses);
  const step = (by: -1 | 1) =>
    setPeriod((p) =>
      p.kind === "month"
        ? { ...p, key: shiftMonth(p.key, by) }
        : { ...p, key: String(Number(p.key) + by) },
    );
  const active = Object.keys(filter).length;
  const accounts = [
    ...new Set(items.map((d) => d.data.account).filter((a) => typeof a === "string" && a)),
  ]
    .map(String)
    .sort();

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" onClick={() => setAdding(!adding)}>
          <Icon name="plus" size={15} /> New entry
        </button>
        <a className="btn" href={collectionPath("payments")}>
          <Icon name="calendar-clock" size={15} /> Payments
        </a>
        <a className="btn" href="/money/review">
          <Icon name="list-checks" size={15} /> Review categories
        </a>
      </div>
      {adding && <MoneyForm onSaved={() => setAdding(false)} />}

      <header className="period-bar">
        <fieldset className="quick-row" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr">Period</legend>
          {(["month", "year"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`btn${period.kind === k ? " primary" : ""}`}
              aria-pressed={period.kind === k}
              onClick={() => setPeriod({ kind: k, key: currentPeriod(k, today) })}
            >
              {k === "month" ? "Month" : "Year"}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="btn"
          aria-label={`Previous ${period.kind}`}
          onClick={() => step(-1)}
        >
          <Icon name="chevron-left" size={15} />
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{periodLabel(period)}</h2>
        <button
          type="button"
          className="btn"
          aria-label={`Next ${period.kind}`}
          onClick={() => step(1)}
        >
          <Icon name="chevron-right" size={15} />
        </button>
        <label style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare to previous
        </label>
      </header>

      <Filters
        filter={filter}
        active={active}
        categories={category?.options ?? []}
        accounts={accounts}
      />

      {(s.incomplete > 0 || undated > 0) && (
        <p role="status" className="panel banner" style={{ margin: 0 }}>
          {s.incomplete > 0 &&
            `${s.incomplete} entr${s.incomplete === 1 ? "y has" : "ies have"} no amount or direction and ${s.incomplete === 1 ? "is" : "are"} not in these totals. `}
          {undated > 0 && `${undated} entr${undated === 1 ? "y has" : "ies have"} no date. `}
          <a href={collectionPath(collection.id, "table")}>Open the table</a>
        </p>
      )}

      <Stats s={s} prev={prev} period={period} />

      {period.kind === "month" ? (
        <DailySpending month={period.key} s={s} today={today} />
      ) : (
        <YearTable s={s} />
      )}

      <div className="split">
        <section
          className="panel"
          aria-label="Where it went"
          style={{ padding: 16, display: "grid", gap: 10 }}
        >
          <span className="k">Where it went · pick one for its 12 months</span>
          {s.byCategory.length === 0 && <span className="muted">No spending in this period.</span>}
          {s.byCategory.map(({ category: c, amount }) => (
            <button
              key={c ?? "__untagged"}
              type="button"
              className="bar-button"
              aria-pressed={c === trendCategory}
              onClick={() => setPicked(c)}
            >
              <BarRow
                label={labelOf(c)}
                value={`${formatMoney(amount)} · ${percent(amount, s.spent)}`}
                share={s.spent === 0 ? 0 : amount / s.spent}
                color={colorOf(c)}
              />
            </button>
          ))}
        </section>
        <section
          className="panel"
          aria-label="Top titles"
          style={{ padding: 16, display: "grid", gap: 10 }}
        >
          <span className="k">Top titles</span>
          {titles.length === 0 && <span className="muted">Nothing yet.</span>}
          {titles.map((t) => (
            <BarRow
              key={t.title}
              label={t.title}
              value={`${formatMoney(t.amount)} · ${t.count}×`}
              share={titles[0] ? t.amount / titles[0].amount : 0}
              color="var(--expense)"
            />
          ))}
          <span className="k" style={{ marginTop: 8 }}>
            Fixed and variable
          </span>
          <BarRow
            label="Fixed (payments)"
            value={formatMoney(fixed.fixed)}
            share={s.spent === 0 ? 0 : fixed.fixed / s.spent}
            color="var(--orange)"
          />
          <BarRow
            label="Variable"
            value={formatMoney(fixed.variable)}
            share={s.spent === 0 ? 0 : fixed.variable / s.spent}
            color="var(--cyan)"
          />
        </section>
      </div>

      <section
        className="panel"
        aria-label="Last 12 months"
        style={{ padding: 16, display: "grid", gap: 10 }}
      >
        <span className="k">Last 12 months</span>
        <PairColumns
          label="Spending and income per month, last 12 months"
          series={[
            { name: "Spent", color: "var(--expense)" },
            { name: "Income", color: "var(--income)" },
          ]}
          slots={trend.map((p) => ({ label: p.month.slice(5), values: [p.spent, p.income] }))}
        />
        <span className="k">Savings rate</span>
        {trend.some((p) => p.savingsRate !== undefined) ? (
          <RateLine
            label="Savings rate per month, last 12 months"
            color="var(--lime)"
            values={trend.map((p) => p.savingsRate)}
            labels={trend.map((p) => p.month)}
          />
        ) : (
          <span className="muted">No income in these months, so no savings rate.</span>
        )}
        <span className="k">{labelOf(trendCategory)} · 12 months</span>
        <Columns
          label={`${labelOf(trendCategory)} per month, last 12 months`}
          values={trend.map((p) => p.category)}
          labels={trend.map((p) => `${p.month}: ${formatMoney(p.category)}`)}
          color={colorOf(trendCategory)}
        />
      </section>

      <section
        className="panel"
        aria-label="Largest"
        style={{ padding: 16, display: "grid", gap: 4 }}
      >
        <span className="k">
          {period.kind === "year" ? "Biggest expenses of the year" : "Largest"}
        </span>
        {s.expenses.slice(0, period.kind === "year" ? 10 : 8).map((e) => (
          <button key={e.doc.id} type="button" className="entry" onClick={() => open(e.doc.id)}>
            <span style={{ flex: 1, textAlign: "left" }}>
              {e.category === null && <span className="chip untagged">tag me</span>}{" "}
              {titleOf(e.doc)}
            </span>
            <span className="num muted" style={{ fontSize: 12 }}>
              {shortDay(e.day)}
            </span>
            <span className="num" style={{ color: "var(--expense)" }}>
              {signedMoney(e.amount, "expense")}
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

function Stats({
  s,
  prev,
  period,
}: {
  s: PeriodSummary;
  prev: PeriodSummary | undefined;
  period: { kind: Kind; key: string };
}) {
  const vs = (now: number, before: number | undefined) =>
    before === undefined ? undefined : `${change(now, before)} vs before`;
  const elapsed = s.months.reduce((t, m) => t + m.daysElapsed, 0);
  const monthsElapsed = s.months.filter((m) => m.daysElapsed > 0).length;
  return (
    <div className="stats">
      <Stat
        label="Income"
        value={signedMoney(s.income, "income")}
        note={vs(s.income, prev?.income) ?? `${s.incomeCount} entries`}
        tone="var(--income)"
      />
      <Stat
        label="Spent"
        value={signedMoney(s.spent, "expense")}
        note={vs(s.spent, prev?.spent) ?? `${s.spentCount} entries`}
        tone="var(--expense)"
      />
      <Stat
        label="Net"
        value={signedMoney(s.net, s.net >= 0 ? "income" : "expense")}
        note={vs(s.net, prev?.net) ?? "income − spent"}
      />
      <Stat
        label="Transfers"
        value={formatMoney(s.transferred)}
        note="investments and moves, not spending"
      />
      {period.kind === "month" ? (
        <Stat
          label="Burn rate"
          value={elapsed > 0 ? `${formatMoney(Math.round(s.spent / elapsed))}/day` : "—"}
          note={elapsed > 0 ? `${elapsed} days` : "not started"}
        />
      ) : (
        <Stat
          label="Average month"
          value={monthsElapsed > 0 ? formatMoney(Math.round(s.spent / monthsElapsed)) : "—"}
          note={monthsElapsed > 0 ? `${monthsElapsed} months so far` : "not started"}
        />
      )}
    </div>
  );
}

function DailySpending({ month, s, today }: { month: string; s: PeriodSummary; today: string }) {
  const days = s.months[0]?.byDay ?? [];
  const peak = days.indexOf(Math.max(...days));
  const day = (i: number) => `${month}-${String(i + 1).padStart(2, "0")}`;
  return (
    <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
      <span className="k">
        Daily spending
        {s.spent > 0 && ` · peak ${shortDay(day(peak))} ${formatMoney(days[peak] ?? 0)}`}
      </span>
      <Columns
        label={`Spending per day in ${monthName(month)}`}
        values={days}
        labels={days.map((v, i) => `${shortDay(day(i))}: ${formatMoney(v)}`)}
        color="var(--expense)"
        {...(month === today.slice(0, 7) ? { highlight: Number(today.slice(8)) - 1 } : {})}
      />
    </section>
  );
}

/** The year as a table: each month's totals, the same numbers `money_month` gives. */
function YearTable({ s }: { s: PeriodSummary }) {
  return (
    <section className="panel" aria-label="Months" style={{ padding: 4, overflowX: "auto" }}>
      <table className="table month-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Spent</th>
            <th>Net</th>
            <th>Transfers</th>
          </tr>
        </thead>
        <tbody>
          {s.months.map((m) => (
            <tr key={m.month}>
              <td>{monthName(m.month)}</td>
              <td className="num">{formatMoney(m.income)}</td>
              <td className="num">{formatMoney(m.spent)}</td>
              <td className="num">{signedMoney(m.net, m.net >= 0 ? "income" : "expense")}</td>
              <td className="num">{formatMoney(m.transferred)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Every filter writes the URL, so a filtered view can be bookmarked. */
function Filters({
  filter,
  active,
  categories,
  accounts,
}: {
  filter: MoneyFilter;
  active: number;
  categories: { value: string; label?: string; emoji?: string }[];
  accounts: string[];
}) {
  const set = (patch: { [K in keyof MoneyFilter]?: MoneyFilter[K] | undefined }) => {
    const next = { ...filter, ...patch } as Record<string, unknown>;
    for (const k of Object.keys(next)) {
      const v = next[k];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete next[k];
    }
    setSearch(filterToSearch(next as MoneyFilter));
  };
  const num = (v: string) => (v === "" ? undefined : Number(v));
  return (
    <details className="panel">
      <summary style={{ padding: "12px 14px", cursor: "pointer" }}>
        Filters{active > 0 ? ` · ${active} on` : ""}
      </summary>
      <div className="money-filters">
        <label className="quick-field">
          <span className="k">From</span>
          <input
            className="input"
            type="date"
            value={filter.from ?? ""}
            onChange={(e) => set({ from: e.target.value })}
          />
        </label>
        <label className="quick-field">
          <span className="k">To</span>
          <input
            className="input"
            type="date"
            value={filter.to ?? ""}
            onChange={(e) => set({ to: e.target.value })}
          />
        </label>
        <label className="quick-field">
          <span className="k">Direction</span>
          <select
            className="input"
            value={filter.direction ?? ""}
            onChange={(e) =>
              set({ direction: (e.target.value || undefined) as MoneyFilter["direction"] })
            }
          >
            <option value="">Both</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>
        <label className="quick-field">
          <span className="k">Account</span>
          <select
            className="input"
            value={filter.account ?? ""}
            onChange={(e) => set({ account: e.target.value })}
          >
            <option value="">Any</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="quick-field">
          <span className="k">Text</span>
          <input
            className="input"
            value={filter.text ?? ""}
            onChange={(e) => set({ text: e.target.value })}
          />
        </label>
        <label className="quick-field">
          <span className="k">Min amount</span>
          <input
            className="input"
            type="number"
            value={filter.min ?? ""}
            onChange={(e) => set({ min: num(e.target.value) })}
          />
        </label>
        <label className="quick-field">
          <span className="k">Max amount</span>
          <input
            className="input"
            type="number"
            value={filter.max ?? ""}
            onChange={(e) => set({ max: num(e.target.value) })}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={filter.uncategorized === true}
            onChange={(e) => set({ uncategorized: e.target.checked || undefined })}
          />
          Uncategorized only
        </label>
        <fieldset
          className="category-grid"
          style={{ gridColumn: "1 / -1", border: 0, padding: 0, margin: 0 }}
        >
          <legend className="k" style={{ paddingBottom: 6 }}>
            Categories
          </legend>
          {categories.map((o) => {
            const on = filter.categories?.includes(o.value) ?? false;
            return (
              <button
                key={o.value}
                type="button"
                className="category-pick"
                aria-pressed={on}
                onClick={() =>
                  set({
                    categories: on
                      ? (filter.categories ?? []).filter((c) => c !== o.value)
                      : [...(filter.categories ?? []), o.value],
                  })
                }
              >
                {optionText(o)}
              </button>
            );
          })}
        </fieldset>
        {active > 0 && (
          <button type="button" className="btn" onClick={() => setSearch("")}>
            Clear filters
          </button>
        )}
      </div>
    </details>
  );
}
