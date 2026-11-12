/** Money → Overview's small rules (M14): where a category row leads, a change, a heat level. */

export interface Period {
  kind: "month" | "year";
  /** `YYYY-MM` or `YYYY`. */
  key: string;
}

/**
 * Transactions for one row of "Where it went", in the same period: a month opens that month
 * and a year opens that year only (1 January to today). Uncategorized opens To review.
 */
export function whereLink(period: Period, category: string | null): string {
  const p = new URLSearchParams({ month: period.key });
  if (category === null) p.set("chip", "review");
  else p.set("category", category);
  return `/money/transactions?${p}`;
}

export interface Change {
  text: string;
  dir: "up" | "down" | "same" | "new";
}

/** The change from `before` to `now`: "↑ 12%", "↓ 8%", "same", or "new" from nothing. */
export function change(now: number, before: number): Change {
  if (before === 0) return now === 0 ? { text: "same", dir: "same" } : { text: "new", dir: "new" };
  const pct = Math.round((Math.abs(now - before) / before) * 100);
  if (pct === 0) return { text: "same", dir: "same" };
  return now > before ? { text: `↑ ${pct}%`, dir: "up" } : { text: `↓ ${pct}%`, dir: "down" };
}

/** A day's or a month's shade, 0 (nothing spent) to 3, against the period's biggest. */
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 {
  if (value <= 0 || max <= 0) return 0;
  const share = value / max;
  return share > 2 / 3 ? 3 : share > 1 / 3 ? 2 : 1;
}
