import { useMemo, useState } from "react";
import { budgetLine, budgetOf } from "../../../shared/budget.ts";
import { optionText, transferCategories } from "../../../shared/categories.ts";
import { daysInMonth, monthName, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { undatedSummary } from "../../../shared/money.ts";
import {
  changeText,
  currentPeriod,
  filterEntries,
  filterFromSearch,
  filterToSearch,
  lastTwelve,
  type MoneyFilter,
  type PeriodSummary,
  periodSummary,
  previousPeriod,
  stackedTwelve,
  topTitles,
} from "../../../shared/money-stats.ts";
import type { SelectOption } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { formatMoney, percent, signedMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useDoc } from "../store/queries.ts";
import { soleAccount } from "../ui/AccountPicker.tsx";
import { BudgetFields } from "../ui/BudgetFields.tsx";
import { BarRow, DayStrip, StackedColumns, Tile } from "../ui/charts.tsx";
import { Icon } from "../ui/icon.tsx";
import { OptionPicker } from "../ui/OptionPicker.tsx";
import type { ViewProps } from "./types.ts";

type Kind = "month" | "year";

const periodLabel = (p: { kind: Kind; key: string }) =>
  p.kind === "month" ? monthName(p.key) : p.key;

/** Transfers into the seed's investment category: the one kind of transfer that is saving. */
const INVESTMENT = "investment";

/**
 * Money → Overview (M12 part 1): the period's four numbers as tiles with their change and a
 * 12-month line, the month day by day, where it went against last period, twelve months
 * stacked by category, the top titles and the largest entries. One screen on a laptop.
 */
export function MoneyDashboard({ collection, items, open }: ViewProps) {
  const today = useToday();
  const db = useCave().local.db;
  const collections = useCollections(db);
  const budget = budgetOf(useDoc(db, "settings")?.data);
  const [editingBudget, setEditingBudget] = useState(false);
  const search = useSearch();
  const filter = useMemo(() => filterFromSearch(search), [search]);
  const [period, setPeriod] = useState<{ kind: Kind; key: string }>(() => ({
    kind: "month",
    key: currentPeriod("month", today),
  }));
  const category = collection.data.fields.find((f) => f.id === "category");
  const transfers = useMemo(() => transferCategories(category), [category]);
  const filtered = useMemo(() => filterEntries(items, filter), [items, filter]);
  const s = useMemo(
    () => periodSummary(filtered, period, today, transfers),
    [filtered, period, today, transfers],
  );
  const prev = useMemo(
    () => periodSummary(filtered, previousPeriod(period), today, transfers),
    [filtered, period, today, transfers],
  );
  const endMonth = period.kind === "month" ? period.key : `${period.key}-12`;
  const trend = useMemo(
    () => lastTwelve(filtered, endMonth, today, transfers),
    [filtered, endMonth, today, transfers],
  );
  const stacked = useMemo(
    () => stackedTwelve(filtered, endMonth, today, transfers),
    [filtered, endMonth, today, transfers],
  );
  const undated = useMemo(() => undatedSummary(items), [items]);
  const labelOf = (value: string | null) => {
    if (value === null) return "Uncategorized";
    const o = category?.options?.find((x) => x.value === value);
    return o ? optionText(o) : value;
  };
  const colorOf = (value: string | null) =>
    category?.options?.find((o) => o.value === value)?.color ?? "var(--muted)";
  const invested = (p: PeriodSummary) =>
    p.months.reduce(
      (t, m) =>
        t + m.transfers.filter((e) => e.category === INVESTMENT).reduce((a, e) => a + e.amount, 0),
      0,
    );
  const saved = (p: PeriodSummary) => p.income - p.spent;
  // The year's limit is twelve months of the monthly one, measured over the days elapsed.
  const line =
    budget.monthlyLimit === undefined
      ? undefined
      : budgetLine(
          budget.monthlyLimit * (period.kind === "month" ? 1 : 12),
          s.spent,
          s.months.reduce((t, m) => t + m.daysElapsed, 0),
          s.months.reduce((t, m) => t + daysInMonth(m.month), 0),
        );
  const target =
    budget.savingTarget === undefined
      ? undefined
      : budget.savingTarget * (period.kind === "month" ? 1 : 12);
  const titles = topTitles(s.expenses, 5);
  const step = (by: -1 | 1) =>
    setPeriod((p) =>
      p.kind === "month"
        ? { ...p, key: shiftMonth(p.key, by) }
        : { ...p, key: String(Number(p.key) + by) },
    );
  const active = Object.keys(filter).length;
  const sole = soleAccount(collections);
  const accounts = sole
    ? []
    : [...new Set(items.map((d) => d.data.account).filter((a) => typeof a === "string" && a))]
        .map(String)
        .sort();
  const before = period.kind === "month" ? "last month" : "last year";
  const vs = (now: number, was: number) => `${changeText(now, was)} vs ${before}`;
  const days = s.months[0]?.byDay ?? [];
  const peak = days.indexOf(Math.max(...days));
  const dayOf = (i: number) => `${period.key}-${String(i + 1).padStart(2, "0")}`;
  const monthLink = (c: string | null) =>
    `/money/transactions?${new URLSearchParams({
      ...(period.kind === "month" ? { month: period.key } : { month: "all" }),
      ...(c === null ? { chip: "uncategorized" } : { category: c }),
    }).toString()}`;

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
        <Filters
          filter={filter}
          active={active}
          categories={category?.options ?? []}
          accounts={accounts}
        />
      </header>

      {(s.incomplete > 0 || undated.count > 0) && (
        <p role="status" className="panel banner" style={{ margin: 0 }}>
          {s.incomplete > 0 &&
            `${s.incomplete} entr${s.incomplete === 1 ? "y has" : "ies have"} no amount or direction and ${s.incomplete === 1 ? "is" : "are"} not in these totals. `}
          {undated.count > 0 &&
            `${undated.count} undated, ${formatMoney(undated.amount)} not counted. `}
          <a href="/money/transactions">Open Transactions</a>
        </p>
      )}

      <div className="tiles">
        <Tile
          label="Spent"
          value={signedMoney(s.spent, "expense")}
          note={`${vs(s.spent, prev.spent)} · ${s.spentCount} entries`}
          tone="var(--expense)"
          trend={{ values: trend.map((p) => p.spent), label: "Spent per month, 12 months" }}
        />
        <Tile
          label="Income"
          value={signedMoney(s.income, "income")}
          note={`${vs(s.income, prev.income)} · ${s.incomeCount} entries`}
          tone="var(--income)"
          trend={{ values: trend.map((p) => p.income), label: "Income per month, 12 months" }}
        />
        <Tile
          label="Saved"
          value={signedMoney(saved(s), saved(s) >= 0 ? "income" : "expense")}
          note={
            s.income > 0
              ? `${percent(Math.max(saved(s), 0), s.income)} of income · ${vs(saved(s), saved(prev))}${
                  target === undefined ? "" : ` · target ${formatMoney(target)}`
                }`
              : "no income in this period"
          }
          tone={
            saved(s) < 0 || (target !== undefined && saved(s) < target)
              ? "var(--expense)"
              : "var(--accent)"
          }
          trend={{
            values: trend.map((p) => Math.max(p.income - p.spent, 0)),
            label: "Saved per month, 12 months",
          }}
        />
        <Tile
          label="Invested"
          value={formatMoney(invested(s))}
          note={`${vs(invested(s), invested(prev))} · ${formatMoney(s.transferred)} moved in all`}
          tone="var(--cyan)"
          trend={{
            values: trend.map((p) => p.transferred),
            label: "Transfers per month, 12 months",
          }}
        />
        <Tile
          label="Budget"
          value={
            line === undefined
              ? "—"
              : line.left >= 0
                ? `${formatMoney(line.left)} left`
                : `${formatMoney(-line.left)} over`
          }
          note={
            line === undefined
              ? "Set a monthly limit"
              : `${formatMoney(line.spent)} of ${formatMoney(line.limit)}${
                  line.pace === undefined ? "" : ` · at this rate ${formatMoney(line.pace)}`
                }`
          }
          tone={
            line === undefined
              ? undefined
              : line.share >= 1
                ? "var(--expense)"
                : line.share >= 0.8
                  ? "var(--warn)"
                  : "var(--accent)"
          }
          action={
            <button
              type="button"
              className="link"
              aria-expanded={editingBudget}
              onClick={() => setEditingBudget(!editingBudget)}
            >
              Edit
            </button>
          }
        />
      </div>
      {editingBudget && (
        <section className="panel" aria-label="Budget settings" style={{ padding: 16 }}>
          <BudgetFields />
        </section>
      )}

      <div className="split">
        {period.kind === "month" ? (
          <section
            className="panel"
            aria-label="Day by day"
            style={{ padding: 16, display: "grid", gap: 10 }}
          >
            <span className="k">
              Day by day
              {s.spent > 0 && ` · peak ${shortDay(dayOf(peak))} ${formatMoney(days[peak] ?? 0)}`}
              {s.months[0] && s.months[0].daysElapsed > 0
                ? ` · ${formatMoney(Math.round(s.spent / s.months[0].daysElapsed))} a day`
                : ""}
            </span>
            <DayStrip
              values={days}
              labels={days.map((v, i) => `${shortDay(dayOf(i))}: ${formatMoney(v)}`)}
              label={`Spending per day in ${monthName(period.key)}`}
              {...(period.key === today.slice(0, 7) ? { today: Number(today.slice(8)) - 1 } : {})}
            />
          </section>
        ) : (
          <YearTable s={s} />
        )}
        <section
          className="panel"
          aria-label="Where it went"
          style={{ padding: 16, display: "grid", gap: 4 }}
        >
          <span className="k" style={{ paddingBottom: 6 }}>
            Where it went · against {before}
          </span>
          {s.byCategory.length === 0 && <span className="muted">No spending in this period.</span>}
          {s.byCategory.slice(0, 8).map(({ category: c, amount }) => {
            const was = prev.byCategory.find((x) => x.category === c)?.amount ?? 0;
            return (
              <a key={c ?? "__untagged"} className="where-row" href={monthLink(c)}>
                <span>{labelOf(c)}</span>
                <span className="num muted" style={{ fontSize: 12 }}>
                  {changeText(amount, was)}
                </span>
                <span className="num">
                  {formatMoney(amount)} · {percent(amount, s.spent)}
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${s.spent === 0 ? 0 : Math.max((amount / s.spent) * 100, 1)}%`,
                      background: colorOf(c),
                    }}
                  />
                </span>
              </a>
            );
          })}
        </section>
      </div>

      <div className="split">
        <section
          className="panel"
          aria-label="Last 12 months"
          style={{ padding: 16, display: "grid", gap: 10 }}
        >
          <span className="k">Last 12 months · by category</span>
          <StackedColumns
            label="Spending per month by category, last 12 months"
            series={[
              ...stacked.categories.map((c) => ({ name: labelOf(c), color: colorOf(c) })),
              ...(stacked.other ? [{ name: "Other", color: "var(--muted)" }] : []),
            ]}
            slots={stacked.months.map((m) => ({
              label: m.month.slice(5),
              values: m.values,
              total: m.total,
            }))}
          />
        </section>
        <section
          className="panel"
          aria-label="Top titles"
          style={{ padding: 16, display: "grid", gap: 8 }}
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
          <span className="k" style={{ marginTop: 6 }}>
            {period.kind === "year" ? "Biggest expenses of the year" : "Largest"}
          </span>
          <section aria-label="Largest" style={{ display: "grid", gap: 2 }}>
            {s.expenses.slice(0, period.kind === "year" ? 8 : 5).map((e) => (
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
        </section>
      </div>
    </div>
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
  categories: SelectOption[];
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
  const chosen = filter.categories ?? [];
  const labelOf = (value: string) => {
    const o = categories.find((x) => x.value === value);
    return o ? optionText(o) : value;
  };
  return (
    <details className="panel" style={{ marginLeft: "auto", position: "relative" }}>
      <summary style={{ padding: "7px 12px", cursor: "pointer" }}>
        Filters{active > 0 ? ` · ${active} on` : ""}
      </summary>
      <div className="money-filters filters-pop">
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
        {accounts.length > 0 && (
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
        )}
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
        <div className="quick-field" style={{ gridColumn: "1 / -1" }}>
          <span className="k">Categories</span>
          <OptionPicker
            label="Add a category"
            options={categories.filter((o) => !chosen.includes(o.value))}
            value=""
            onChange={(value) => {
              if (value) set({ categories: [...chosen, value] });
            }}
            allowEmpty={false}
            placeholder="Type to add"
          />
          {chosen.length > 0 && (
            <ul className="chips" aria-label="Chosen categories">
              {chosen.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Remove ${labelOf(c)}`}
                    onClick={() => set({ categories: chosen.filter((x) => x !== c) })}
                  >
                    {labelOf(c)} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {active > 0 && (
          <button type="button" className="btn" onClick={() => setSearch("")}>
            Clear filters
          </button>
        )}
      </div>
    </details>
  );
}
