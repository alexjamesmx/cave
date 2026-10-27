/**
 * The budget (M12 part 2): two numbers the owner types into `settings.budget`, a monthly
 * spending limit and a monthly saving target, both amounts in the owner's currency. Everything
 * else here is computed from them and the month's entries; nothing is ever guessed.
 */

export interface Budget {
  monthlyLimit?: number;
  savingTarget?: number;
}

const amount = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;

/** `settings.budget`, read defensively: only positive finite numbers count. */
export function budgetOf(settings: Record<string, unknown> | undefined): Budget {
  const raw = settings?.budget;
  if (!raw || typeof raw !== "object") return {};
  const b = raw as Record<string, unknown>;
  const monthlyLimit = amount(b.monthlyLimit);
  const savingTarget = amount(b.savingTarget);
  return {
    ...(monthlyLimit !== undefined ? { monthlyLimit } : {}),
    ...(savingTarget !== undefined ? { savingTarget } : {}),
  };
}

export interface BudgetLine {
  limit: number;
  spent: number;
  /** Negative once over the limit. */
  left: number;
  /** Spent over the limit, 1 at the limit. */
  share: number;
  /** What the period ends at if spending keeps its daily rate; `undefined` before it starts. */
  pace: number | undefined;
}

/** The limit against what was spent, `daysElapsed` of `daysTotal` into the period. */
export function budgetLine(
  limit: number,
  spent: number,
  daysElapsed: number,
  daysTotal: number,
): BudgetLine {
  return {
    limit,
    spent,
    left: limit - spent,
    share: limit === 0 ? 0 : spent / limit,
    pace:
      daysElapsed > 0 && daysTotal > 0
        ? Math.round((spent / Math.min(daysElapsed, daysTotal)) * daysTotal)
        : undefined,
  };
}
