import type { SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { formatMoney } from "./format.ts";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * The account a new entry starts on: the one the newest entry used, while that account is
 * still offered; otherwise the first offered one. An archived account is never preselected.
 */
export function lastAccount(
  items: readonly Doc[],
  offered: readonly SelectOption[],
): string | undefined {
  const live = new Set(offered.map((o) => o.value));
  let newest: { account: string; at: string } | undefined;
  for (const d of items) {
    const account = str(d.data.account);
    if (d.data._deleted === true || !live.has(account)) continue;
    const at = str(d.data._created) || str(d.data.date);
    if (!newest || at > newest.at) newest = { account, at };
  }
  return newest?.account ?? offered[0]?.value;
}

/** `options` with the most used first (by how many items hold each); ties keep their order. */
export function byUse(items: readonly Doc[], options: readonly SelectOption[]): SelectOption[] {
  const uses = new Map<string, number>();
  for (const d of items) {
    const c = str(d.data.category);
    if (c) uses.set(c, (uses.get(c) ?? 0) + 1);
  }
  return [...options].sort((a, b) => (uses.get(b.value) ?? 0) - (uses.get(a.value) ?? 0));
}

/** A typed amount, `$` and thousands commas allowed; `undefined` unless it is above zero. */
export function parseAmount(text: string): number | undefined {
  const plain = text.replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(plain)) return undefined;
  const value = Number(plain);
  return value > 0 && Number.isFinite(value) ? value : undefined;
}

/** "Save −$245 · Food": the sign, the amount and the category, as far as they are known. */
export function saveLabel(
  direction: "expense" | "income",
  amount: number | undefined,
  category: string | undefined,
): string {
  if (amount === undefined) return "Save";
  const sign = direction === "income" ? "+" : "−";
  return `Save ${sign}${formatMoney(amount)}${category ? ` · ${category}` : ""}`;
}
