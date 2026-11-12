import { expenseFrom } from "../../../shared/payments.ts";
import type { SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";

/**
 * The expense one tap on a subscription's Paid logs (M14): its name, amount, category and
 * account, dated `date`, linked to it, so Spent and Since count it like any real charge.
 * `undefined` when one tap can't know it all (the amount varies or is missing, or the
 * category or account is no longer offered): the money form asks instead of guessing.
 */
export function paidEntry(
  sub: Doc,
  categories: readonly SelectOption[],
  accounts: readonly SelectOption[],
  date: string,
): Record<string, unknown> | undefined {
  const e = expenseFrom(sub);
  const offered = (list: readonly SelectOption[], value: string | undefined) =>
    value !== undefined && list.some((o) => o.value === value && o.archived !== true);
  if (e.amount === undefined || !offered(categories, e.category) || !offered(accounts, e.account))
    return undefined;
  return {
    _title: e.title ?? "",
    amount: e.amount,
    direction: "expense",
    date,
    category: e.category,
    account: e.account,
    payment: sub.id,
  };
}
