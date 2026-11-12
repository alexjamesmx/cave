import { type CSSProperties, useMemo, useState } from "react";
import { budgetLine, budgetOf } from "../../../shared/budget.ts";
import { transferCategories } from "../../../shared/categories.ts";
import { daysInMonth, monthGrid, monthName, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { undatedSummary } from "../../../shared/money.ts";
import {
  currentPeriod,
  type PeriodSummary,
  periodSummary,
  previousPeriod,
  stackedTwelve,
} from "../../../shared/money-stats.ts";
import type { SelectOption } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { formatMoney, percent } from "../logic/format.ts";
import { change, heatLevel, type Period, whereLink } from "../logic/overview.ts";
import { useDoc } from "../store/queries.ts";
import { BudgetFields } from "../ui/BudgetFields.tsx";
import { Icon } from "../ui/icon.tsx";
import { MarkTile } from "../ui/OptionTile.tsx";
import type { ViewProps } from "./types.ts";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
/** Rows "Where it went" lists; the rest are a link away. */
const WHERE_ROWS = 8;

const tint = (color: string) => ({ "--c": color }) as CSSProperties;
const monthShort = (month: string) => shortDay(`${month}-01`).split(" ")[0] ?? month;
const monthLong = (month: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/**
 * A change against the period before, coloured by whether it is good news: less spent, more
 * come in.
 */
function Versus({
  now,
  was,
  before,
  good,
}: {
  now: number;
  was: number;
  before: string;
  good: "up" | "down";
}) {
  const c = change(now, was);
  if (c.dir === "same") return <>Same as {before}</>;
  if (c.dir === "new") return <>None in {before}</>;
  return (
    <>
      <span className={c.dir === good ? "in" : "out"}>{c.text}</span> vs {before}
    </>
  );
}

/** The budget card: what is left of the limit, or, with none set, the daily rate. */
function BudgetCard({
  s,
  period,
  limit,
  editing,
  onEdit,
}: {
  s: PeriodSummary;
  period: Period;
  limit: number | undefined;
  editing: boolean;
  onEdit(): void;
}) {
  // The year's limit is twelve months of the monthly one, measured over the days elapsed.
  const days = s.months.reduce((t, m) => t + daysInMonth(m.month), 0);
  const elapsed = s.months.reduce((t, m) => t + m.daysElapsed, 0);
  const line =
    limit === undefined
      ? undefined
      : budgetLine(limit * (period.kind === "month" ? 1 : 12), s.spent, elapsed, days);
  const toGo = days - elapsed;
  const tone =
    line === undefined ? "" : line.share >= 1 ? " out" : line.share >= 0.8 ? " warn" : " in";
  return (
    <section className="panel m-stat ov-kpi" aria-label="Budget left">
      <span className="m-label">
        Budget left
        <button type="button" className="link ov-edit" aria-expanded={editing} onClick={onEdit}>
          {line ? "Edit" : "Set"}
        </button>
      </span>
      <span className={`m-big num${tone}`}>
        {line === undefined
          ? "—"
          : line.left >= 0
            ? formatMoney(line.left)
            : `${formatMoney(-line.left)} over`}
      </span>
      {line && (
        <span className={`m-meter${tone}`} aria-hidden="true">
          <span style={{ width: `${Math.min(line.share, 1) * 100}%` }} />
        </span>
      )}
      <span className="m-note">
        {line
          ? `${percent(line.spent, line.limit)} of ${formatMoney(line.limit)}${
              elapsed > 0 && toGo > 0 ? ` · ${toGo} ${toGo === 1 ? "day" : "days"} to go` : ""
            }`
          : `No limit set${elapsed > 0 ? ` · ${formatMoney(Math.round(s.spent / elapsed))} a day` : ""}`}
      </span>
    </section>
  );
}

/** The month as a calendar shaded by each day's spending; days to come are outlined. */
function DayHeat({ s, month, today }: { s: PeriodSummary; month: string; today: string }) {
  const values = s.months[0]?.byDay ?? [];
  const max = Math.max(0, ...values);
  const peak = values.indexOf(max);
  const dayOf = (i: number) => `${month}-${String(i + 1).padStart(2, "0")}`;
  return (
    <section className="panel ov-panel" aria-label="Day by day">
      <header className="ov-head">
        <h2 className="ov-h">Day by day</h2>
        {max > 0 && (
          <span className="m-note num">
            Peak {shortDay(dayOf(peak))} · {formatMoney(max)}
          </span>
        )}
      </header>
      <div className="ov-week" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: weekdays are positional
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="ov-heat" role="img" aria-label={`Spending per day in ${monthName(month)}`}>
        {monthGrid(month)
          .flat()
          .map((day, i) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: the padding before and after the month is positional
            if (!day) return <span key={`pad-${i}`} className="ov-cell pad" />;
            const v = values[Number(day.slice(8)) - 1] ?? 0;
            const state = day === today ? " today" : day > today ? " later" : "";
            return (
              <span
                key={day}
                className={`ov-cell h${heatLevel(v, max)}${state}`}
                title={`${shortDay(day)}: ${formatMoney(v)}`}
              >
                {Number(day.slice(8))}
              </span>
            );
          })}
      </div>
      <HeatKey />
    </section>
  );
}

/** A year as twelve months shaded by spending, so a heavy month stands out at a glance. */
function MonthHeat({ s, year }: { s: PeriodSummary; year: string }) {
  const max = Math.max(0, ...s.months.map((m) => m.spent));
  const peak = s.months.find((m) => m.spent === max && max > 0);
  return (
    <section className="panel ov-panel" aria-label="Month by month">
      <header className="ov-head">
        <h2 className="ov-h">Month by month</h2>
        {peak && (
          <span className="m-note num">
            Peak {monthShort(peak.month)} · {formatMoney(peak.spent)}
          </span>
        )}
      </header>
      <div className="ov-heat months" role="img" aria-label={`Spending per month in ${year}`}>
        {s.months.map((m) => (
          <span
            key={m.month}
            className={`ov-cell h${heatLevel(m.spent, max)}${m.daysElapsed === 0 ? " later" : ""}`}
            title={`${monthName(m.month)}: ${formatMoney(m.spent)}`}
          >
            <b>{monthShort(m.month)}</b>
            <span className="num">{m.spent > 0 ? formatMoney(m.spent) : "—"}</span>
          </span>
        ))}
      </div>
      <HeatKey />
    </section>
  );
}

function HeatKey() {
  return (
    <div className="ov-key m-note" aria-hidden="true">
      Less
      {[0, 1, 2, 3].map((h) => (
        <span key={h} className={`ov-cell h${h}`} />
      ))}
      More
    </div>
  );
}

/**
 * Money → Overview (M14): a month or a year as four numbers (spent, come in, saved, budget
 * left), where it went beside the days (or months) shaded by spending, and twelve months
 * stacked by category underneath. A category opens Transactions for the same period.
 */
export function MoneyDashboard({ collection, items }: ViewProps) {
  const today = useToday();
  const db = useCave().local.db;
  const budget = budgetOf(useDoc(db, "settings")?.data);
  const [editingBudget, setEditingBudget] = useState(false);
  const [period, setPeriod] = useState<Period>(() => ({
    kind: "month",
    key: currentPeriod("month", today),
  }));
  const category = collection.data.fields.find((f) => f.id === "category");
  const transfers = useMemo(() => transferCategories(category), [category]);
  const s = useMemo(
    () => periodSummary(items, period, today, transfers),
    [items, period, today, transfers],
  );
  const before = previousPeriod(period);
  const prev = useMemo(
    () => periodSummary(items, previousPeriod(period), today, transfers),
    [items, period, today, transfers],
  );
  const endMonth = period.kind === "month" ? period.key : `${period.key}-12`;
  const stacked = useMemo(
    () => stackedTwelve(items, endMonth, today, transfers),
    [items, endMonth, today, transfers],
  );
  const undated = useMemo(() => undatedSummary(items), [items]);
  const optionOf = (value: string | null): SelectOption | undefined =>
    category?.options?.find((o) => o.value === value);
  const nameOf = (value: string | null) => {
    if (value === null) return "To review";
    const o = optionOf(value);
    return o ? o.label || o.value : value;
  };
  const emojiOf = (value: string | null) =>
    value === null ? "❔" : (optionOf(value)?.emoji ?? "•");
  const colorOf = (value: string | null) =>
    value === null ? "var(--warn)" : (optionOf(value)?.color ?? "var(--muted)");
  const beforeName = period.kind === "month" ? monthLong(before.key) : before.key;
  const saved = s.income - s.spent;
  const step = (by: -1 | 1) =>
    setPeriod((p) => ({
      ...p,
      key: p.kind === "month" ? shiftMonth(p.key, by) : String(Number(p.key) + by),
    }));
  const unit = period.kind;
  const series = [
    ...stacked.categories.map((c) => ({ name: `${emojiOf(c)} ${nameOf(c)}`, color: colorOf(c) })),
    ...(stacked.other ? [{ name: "Other", color: "var(--muted)" }] : []),
  ];
  const tallest = Math.max(0, ...stacked.months.map((m) => m.total));
  const where = s.byCategory.slice(0, WHERE_ROWS);
  const rest = s.byCategory.length - where.length;

  return (
    <div className="ov-page">
      <div className="m-scope">
        <fieldset className="m-seg">
          <legend className="sr">Period</legend>
          {(["month", "year"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={period.kind === k}
              onClick={() => setPeriod({ kind: k, key: currentPeriod(k, today) })}
            >
              {k === "month" ? "Month" : "Year"}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Previous ${unit}`}
          onClick={() => step(-1)}
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <h2 className="m-scope-label">
          {period.kind === "month" ? monthName(period.key) : period.key}
        </h2>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Next ${unit}`}
          onClick={() => step(1)}
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      {(s.incomplete > 0 || undated.count > 0) && (
        <p role="status" className="panel banner ov-banner">
          {s.incomplete > 0 &&
            `${s.incomplete} entr${s.incomplete === 1 ? "y has" : "ies have"} no amount or direction and ${s.incomplete === 1 ? "is" : "are"} not in these totals. `}
          {undated.count > 0 &&
            `${undated.count} undated, ${formatMoney(undated.amount)} not counted. `}
          <a href="/money/transactions">Open Transactions</a>
        </p>
      )}

      <div className="ov-kpis">
        <section className="panel m-stat ov-kpi" aria-label="Spent">
          <span className="m-label">Spent</span>
          <span className="m-big num out">{formatMoney(s.spent)}</span>
          <span className="m-note">
            <Versus now={s.spent} was={prev.spent} before={beforeName} good="down" />
          </span>
        </section>
        <section className="panel m-stat ov-kpi" aria-label="Came in">
          <span className="m-label">Came in</span>
          <span className="m-big num in">{formatMoney(s.income)}</span>
          <span className="m-note">
            <Versus now={s.income} was={prev.income} before={beforeName} good="up" />
          </span>
        </section>
        <section className="panel m-stat ov-kpi" aria-label="Saved">
          <span className="m-label">Saved</span>
          <span className={`m-big num${saved < 0 ? " out" : ""}`}>
            {saved < 0 ? "−" : ""}
            {formatMoney(Math.abs(saved))}
          </span>
          <span className="m-note">
            {s.income > 0
              ? `${percent(Math.max(saved, 0), s.income)} of what came in`
              : "Nothing came in"}
            {budget.savingTarget !== undefined &&
              ` · target ${formatMoney(budget.savingTarget * (period.kind === "month" ? 1 : 12))}`}
          </span>
        </section>
        <BudgetCard
          s={s}
          period={period}
          limit={budget.monthlyLimit}
          editing={editingBudget}
          onEdit={() => setEditingBudget(!editingBudget)}
        />
      </div>
      {editingBudget && (
        <section className="panel ov-budget" aria-label="Budget settings">
          <BudgetFields />
        </section>
      )}

      <div className="ov-pair">
        <section className="panel ov-panel" aria-label="Where it went">
          <header className="ov-head">
            <h2 className="ov-h">Where it went</h2>
            <span className="m-note">vs {beforeName}</span>
          </header>
          {where.length === 0 && <p className="m-note">No spending in this period.</p>}
          <div className="ov-where-list">
            {where.map(({ category: c, amount }) => {
              const was = prev.byCategory.find((x) => x.category === c)?.amount ?? 0;
              const share = s.spent === 0 ? 0 : (amount / s.spent) * 100;
              return (
                <a
                  key={c ?? "\u0000"}
                  className="ov-where"
                  href={whereLink(period, c)}
                  style={tint(colorOf(c))}
                >
                  <MarkTile mark={emojiOf(c)} />
                  <span className="ov-where-name">
                    <span>{nameOf(c)}</span>
                    <span className="m-meter" aria-hidden="true">
                      <span style={{ width: `${Math.max(share, 1)}%` }} />
                    </span>
                  </span>
                  <span className="num ov-amt">{formatMoney(amount)}</span>
                  <span className="num m-note">{Math.round(share)}%</span>
                  <span className="num m-note">{change(amount, was).text}</span>
                </a>
              );
            })}
          </div>
          {rest > 0 && (
            <a
              className="m-note ov-more"
              href={`/money/transactions?month=${period.key}&chip=expense`}
            >
              {rest} more in Transactions
            </a>
          )}
        </section>
        {period.kind === "month" ? (
          <DayHeat s={s} month={period.key} today={today} />
        ) : (
          <MonthHeat s={s} year={period.key} />
        )}
      </div>

      <section className="panel ov-panel" aria-label="Last 12 months">
        <header className="ov-head">
          <h2 className="ov-h">
            {period.kind === "year" ? `${period.key} by month` : "Last 12 months"}
          </h2>
          <div className="ov-legend m-note" aria-hidden="true">
            {series.map((x) => (
              <span key={x.name}>
                <i style={{ background: x.color }} />
                {x.name}
              </span>
            ))}
          </div>
        </header>
        <div
          className="ov-stack"
          role="img"
          aria-label="Spending per month by category, last 12 months"
        >
          {stacked.months.map((m) => (
            <div
              key={m.month}
              className={`ov-col${period.kind === "month" && m.month === endMonth ? " now" : ""}`}
            >
              <div className="ov-track">
                <div
                  className="ov-bars"
                  title={`${monthName(m.month)}: ${formatMoney(m.total)}`}
                  style={{ height: tallest === 0 ? 0 : `${(m.total / tallest) * 100}%` }}
                >
                  {m.values.map((v, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: the series is positional
                      key={i}
                      title={`${series[i]?.name}: ${formatMoney(v)}`}
                      style={{ flexGrow: v, background: series[i]?.color }}
                    />
                  ))}
                </div>
              </div>
              <span className="m-note">{monthShort(m.month)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
