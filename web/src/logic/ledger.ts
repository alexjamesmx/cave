import { kindOf } from "../../../shared/categories.ts";
import { dayOf, monthName, monthOf, shiftMonth, shortDay } from "../../../shared/dates.ts";
import { normTitle } from "../../../shared/money-stats.ts";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";

/**
 * The ledger as Money → Transactions shows it (M14): one scope (a month, or a year from
 * 1 January up to today), a direction chip, one search over every field, and rows grouped by
 * day with a total each. Undated entries are their own group on top, never in a total.
 */

export const CHIPS = ["all", "expense", "income", "review"] as const;
export type Chip = (typeof CHIPS)[number];

export interface LedgerQuery {
  /** `YYYY-MM` for a month, `YYYY` for a year. */
  month: string;
  chip: Chip;
  text: string;
  /** One category value, as Overview's links open it; empty for any. */
  category: string;
}

export interface LedgerDay {
  day: string;
  rows: Doc[];
  in: number;
  out: number;
}

export interface Ledger {
  undated: Doc[];
  days: LedgerDay[];
  /** Over the dated rows shown; `inCategories` are income categories, biggest first. */
  totals: {
    in: number;
    out: number;
    transferred: number;
    count: number;
    inCount: number;
    outCount: number;
    inCategories: string[];
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Whether a select value counts as missing: empty, or one no option holds. */
export const isUncategorized = (field: Field | undefined, value: unknown) =>
  !str(value) || !field?.options?.some((o) => o.value === value);

/** To review: an entry with no category or no account. */
export const needsReview = (doc: Doc, category: Field | undefined, account: Field | undefined) =>
  isUncategorized(category, doc.data.category) || isUncategorized(account, doc.data.account);

/** What the money did, from the category's kind first, then the stored direction. */
export function movementOf(
  field: Field | undefined,
  doc: Doc,
): "expense" | "income" | "transfer" | "incomplete" {
  if (typeof doc.data.amount !== "number") return "incomplete";
  if (kindOf(field, doc.data.category) === "transfer") return "transfer";
  const d = doc.data.direction;
  return d === "income" || d === "expense" ? d : "incomplete";
}

// `$1,225` and `1225` are one amount: the symbol and thousands separators carry nothing.
const amountOf = (token: string): number | undefined => {
  const plain = token.replace(/[$,]/g, "");
  return /^\d+(\.\d+)?$/.test(plain) ? Number(plain) : undefined;
};

/**
 * Whether every word of `q` is found in the entry: its title or note, its category's or
 * account's value or name, or, for a number, its amount. Accents and case are ignored.
 */
export function matchesSearch(
  doc: Doc,
  fields: { category?: Field | undefined; account?: Field | undefined },
  q: string,
): boolean {
  const words = normTitle(q).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const named = (field: Field | undefined, value: unknown) => {
    const v = str(value);
    return v ? `${v} ${field?.options?.find((o) => o.value === v)?.label ?? ""}` : "";
  };
  const d = doc.data;
  const text = normTitle(
    [
      str(d._title),
      str(d._body),
      str(d.detail),
      named(fields.category, d.category),
      named(fields.account, d.account),
    ].join(" "),
  );
  return words.every((w) => text.includes(w) || (amountOf(w) ?? Number.NaN) === d.amount);
}

export const isYearScope = (scope: string) => /^\d{4}$/.test(scope);

/** A year runs from 1 January to today, so it never counts what is only planned. */
const inScope = (day: string, scope: string, today: string) =>
  isYearScope(scope) ? day.slice(0, 4) === scope && day <= today : monthOf(day) === scope;

export const scopeLabel = (scope: string) => (isYearScope(scope) ? scope : monthName(scope));

export const stepScope = (scope: string, by: number) =>
  isYearScope(scope) ? String(Number(scope) + by) : shiftMonth(scope, by);

/** Whether › may move on: never past this month or this year. */
export const canStepForward = (scope: string, thisMonth: string) =>
  isYearScope(scope) ? scope < thisMonth.slice(0, 4) : scope < thisMonth;

/** Month ↔ Year keeps the year; a past year opens on its December. */
export function switchScope(scope: string, to: "month" | "year", thisMonth: string): string {
  if (to === "year") return scope.slice(0, 4);
  if (!isYearScope(scope)) return scope;
  return scope === thisMonth.slice(0, 4) ? thisMonth : `${scope}-12`;
}

/** The query as the URL holds it; missing or malformed values fall back to the defaults. */
export function queryFromSearch(search: string, thisMonth: string): LedgerQuery {
  const p = new URLSearchParams(search);
  const month = p.get("month");
  const chip = p.get("chip") as Chip | null;
  return {
    month: month && /^\d{4}(-\d{2})?$/.test(month) ? month : thisMonth,
    chip: chip && CHIPS.includes(chip) ? chip : "all",
    text: p.get("q") ?? "",
    category: p.get("category") ?? "",
  };
}

export function queryToSearch(q: LedgerQuery, thisMonth: string): string {
  const p = new URLSearchParams();
  if (q.month !== thisMonth) p.set("month", q.month);
  if (q.chip !== "all") p.set("chip", q.chip);
  if (q.text) p.set("q", q.text);
  if (q.category) p.set("category", q.category);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** A day's heading: Today, Yesterday, else its weekday, with the month in a year scope. */
export function dayLabel(day: string, today: string, withMonth: boolean): string {
  if (day === today) return "Today";
  const at = (d: string) => new Date(`${d}T12:00:00Z`);
  if (at(today).getTime() - at(day).getTime() === 86_400_000) return "Yesterday";
  const weekday = at(day).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return withMonth ? `${weekday}, ${shortDay(day)}` : `${weekday} ${Number(day.slice(8, 10))}`;
}

export function ledger(
  docs: readonly Doc[],
  q: LedgerQuery,
  categoryField: Field | undefined,
  accountField: Field | undefined,
  today: string,
): Ledger {
  const fields = { category: categoryField, account: accountField };
  const keep = (d: Doc) => {
    if (!matchesSearch(d, fields, q.text)) return false;
    if (q.category && d.data.category !== q.category) return false;
    if (q.chip === "review") return needsReview(d, categoryField, accountField);
    if (q.chip !== "all") return movementOf(categoryField, d) === q.chip;
    return true;
  };
  const kept = docs.filter(keep);
  const undated = kept
    .filter((d) => dayOf(d.data.date) === undefined)
    .sort((a, b) => str(b.data._created).localeCompare(str(a.data._created)));
  const dated = kept
    .filter((d) => {
      const day = dayOf(d.data.date);
      return day !== undefined && inScope(day, q.month, today);
    })
    .sort((a, b) => str(b.data.date).localeCompare(str(a.data.date)));

  const totals = {
    in: 0,
    out: 0,
    transferred: 0,
    count: dated.length,
    inCount: 0,
    outCount: 0,
    inCategories: [] as string[],
  };
  const byIncome = new Map<string, number>();
  const days = new Map<string, LedgerDay>();
  for (const d of dated) {
    const day = dayOf(d.data.date) as string;
    const g = days.get(day) ?? { day, rows: [], in: 0, out: 0 };
    g.rows.push(d);
    const amount = typeof d.data.amount === "number" ? d.data.amount : 0;
    const move = movementOf(categoryField, d);
    if (move === "income") {
      g.in += amount;
      totals.in += amount;
      totals.inCount += 1;
      const c = str(d.data.category);
      if (c) byIncome.set(c, (byIncome.get(c) ?? 0) + amount);
    } else if (move === "expense") {
      g.out += amount;
      totals.out += amount;
      totals.outCount += 1;
    } else if (move === "transfer") totals.transferred += amount;
    days.set(day, g);
  }
  totals.inCategories = [...byIncome].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return { undated, days: [...days.values()], totals };
}
