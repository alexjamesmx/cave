import { normTitle } from "../../../shared/money-stats.ts";
import type { SelectOption } from "../../../shared/schema.ts";

/**
 * The options a searchable select offers for what was typed (M12 part 1): accents and case
 * ignored, matched on the label and the stored value. Options whose text starts with the
 * query come first, then the rest that contain it, each group in the stored order.
 */
export function filterOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const q = normTitle(query);
  const live = options.filter((o) => o.archived !== true);
  if (!q) return live;
  const texts = live.map((o) => ({ o, text: normTitle(`${o.label ?? ""} ${o.value}`) }));
  const starts = texts.filter(
    ({ o, text }) => text.startsWith(q) || normTitle(o.value).startsWith(q),
  );
  const rest = texts.filter((t) => !starts.includes(t) && t.text.includes(q));
  return [...starts, ...rest].map(({ o }) => o);
}
