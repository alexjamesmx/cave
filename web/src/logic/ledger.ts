import { kindOf, optionText } from "../../../shared/categories.ts";
import { dayOf, monthOf, shortDay } from "../../../shared/dates.ts";
import { normTitle } from "../../../shared/money-stats.ts";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";

/**
 * The ledger as Money → Transactions shows it (M12 part 1): one period (a month, or all
 * time), a direction chip, text and list filters, and rows grouped by day, category or
 * account with a subtotal each. Undated entries are their own group on top, never in a total.
 */

export const CHIPS = ["all", "expense", "income", "transfer", "uncategorized"] as const;
export type Chip = (typeof CHIPS)[number];
export const GROUPS = ["day", "category", "account", "none"] as const;
export type GroupBy = (typeof GROUPS)[number];

export interface LedgerQuery {
  /** `YYYY-MM`, or `all`. */
  month: string;
  chip: Chip;
  text: string;
  category: string;
  account: string;
  groupBy: GroupBy;
}

export interface LedgerGroup {
  key: string;
  label: string;
  rows: Doc[];
  in: number;
  out: number;
}

export interface Ledger {
  undated: Doc[];
  groups: LedgerGroup[];
  /** Over the dated rows shown: income, spending, transfers, and the count. */
  totals: { in: number; out: number; transferred: number; count: number };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Whether an entry counts as Uncategorized: no category, or one no option holds. */
export const isUncategorized = (field: Field | undefined, value: unknown) =>
  !str(value) || !field?.options?.some((o) => o.value === value);

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

/** The query as the URL holds it; missing or malformed values fall back to the defaults. */
export function queryFromSearch(search: string, thisMonth: string): LedgerQuery {
  const p = new URLSearchParams(search);
  const month = p.get("month");
  const chip = p.get("chip") as Chip | null;
  const groupBy = p.get("group") as GroupBy | null;
  return {
    month: month === "all" || (month && /^\d{4}-\d{2}$/.test(month)) ? month : thisMonth,
    chip: chip && CHIPS.includes(chip) ? chip : "all",
    text: p.get("q") ?? "",
    category: p.get("category") ?? "",
    account: p.get("account") ?? "",
    groupBy: groupBy && GROUPS.includes(groupBy) ? groupBy : "day",
  };
}

export function queryToSearch(q: LedgerQuery, thisMonth: string): string {
  const p = new URLSearchParams();
  if (q.month !== thisMonth) p.set("month", q.month);
  if (q.chip !== "all") p.set("chip", q.chip);
  if (q.text) p.set("q", q.text);
  if (q.category) p.set("category", q.category);
  if (q.account) p.set("account", q.account);
  if (q.groupBy !== "day") p.set("group", q.groupBy);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function ledger(
  docs: readonly Doc[],
  q: LedgerQuery,
  categoryField: Field | undefined,
  accountField: Field | undefined,
): Ledger {
  const needle = normTitle(q.text);
  const keep = (d: Doc) => {
    if (needle && !normTitle(`${str(d.data._title)} ${str(d.data.detail)}`).includes(needle))
      return false;
    if (q.category && d.data.category !== q.category) return false;
    if (q.account && d.data.account !== q.account) return false;
    if (q.chip === "uncategorized") return isUncategorized(categoryField, d.data.category);
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
      return day !== undefined && (q.month === "all" || monthOf(day) === q.month);
    })
    .sort((a, b) => str(b.data.date).localeCompare(str(a.data.date)));

  const totals = { in: 0, out: 0, transferred: 0, count: dated.length };
  const groups = new Map<string, LedgerGroup>();
  const label = (d: Doc): [string, string] => {
    if (q.groupBy === "day") {
      const day = dayOf(d.data.date) as string;
      return [day, q.month === "all" ? `${shortDay(day)} ${day.slice(0, 4)}` : shortDay(day)];
    }
    if (q.groupBy === "category") {
      const c = str(d.data.category);
      const o = categoryField?.options?.find((x) => x.value === c);
      return isUncategorized(categoryField, c)
        ? ["\u0000", "Uncategorized"]
        : [c, optionText(o ?? { value: c })];
    }
    if (q.groupBy === "account") {
      const a = str(d.data.account);
      const o = accountField?.options?.find((x) => x.value === a);
      return a ? [a, o ? optionText(o) : a] : ["\u0000", "No account"];
    }
    return ["", ""];
  };
  // Everything a group moved, transfers included, orders the category and account groups.
  const moved = new Map<string, number>();
  for (const d of dated) {
    const [key, text] = label(d);
    const g = groups.get(key) ?? { key, label: text, rows: [], in: 0, out: 0 };
    g.rows.push(d);
    const amount = typeof d.data.amount === "number" ? d.data.amount : 0;
    moved.set(key, (moved.get(key) ?? 0) + amount);
    const move = movementOf(categoryField, d);
    if (move === "income") {
      g.in += amount;
      totals.in += amount;
    } else if (move === "expense") {
      g.out += amount;
      totals.out += amount;
    } else if (move === "transfer") totals.transferred += amount;
    groups.set(key, g);
  }
  const ordered = [...groups.values()];
  if (q.groupBy === "category" || q.groupBy === "account")
    ordered.sort((a, b) => (moved.get(b.key) ?? 0) - (moved.get(a.key) ?? 0));
  return { undated, groups: ordered, totals };
}
