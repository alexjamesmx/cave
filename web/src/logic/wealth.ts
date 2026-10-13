import type { Doc } from "../../../shared/types.ts";

export interface WealthSummary {
  assets: number;
  debt: number;
  net: number;
  byType: { type: string | null; value: number }[];
  /** Rows without a numeric value: shown, never counted as zero by guess. */
  missingValue: Doc[];
}

// Debt is entered as the amount owed; its sign in the vault is not relied on.
export function wealthSummary(docs: Doc[]): WealthSummary {
  const byType = new Map<string | null, number>();
  const missingValue: Doc[] = [];
  let assets = 0;
  let debt = 0;
  for (const doc of docs) {
    const { value, type } = doc.data;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      missingValue.push(doc);
      continue;
    }
    const key = typeof type === "string" ? type : null;
    const amount = key === "debt" ? Math.abs(value) : value;
    byType.set(key, (byType.get(key) ?? 0) + amount);
    if (key === "debt") debt += amount;
    else assets += amount;
  }
  return {
    assets,
    debt,
    net: assets - debt,
    byType: [...byType].map(([type, value]) => ({ type, value })).sort((a, b) => b.value - a.value),
    missingValue,
  };
}
