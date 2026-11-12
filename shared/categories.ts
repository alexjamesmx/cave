import { SWATCHES } from "./palette.ts";
import type { Field, OptionKind, SelectOption } from "./schema.ts";

/**
 * The money categories (M7b part 5). `value` is what items store and never changes; `label`
 * and `emoji` are what the app shows, and the owner can edit both. Existing values keep their
 * ids: "health" shows as "Health & gym" without rewriting a single entry.
 */
const S = SWATCHES;

const cat = (
  value: string,
  label: string,
  emoji: string,
  kind: OptionKind,
  icon: string,
  color: string,
): SelectOption => ({ value, label, emoji, kind, icon, color });

export const CATEGORY_SET: SelectOption[] = [
  cat("food", "Food", "🍔", "expense", "utensils", S.orange),
  cat("groceries", "Groceries", "🛒", "expense", "shopping-cart", S.green),
  cat("gula", "Gula", "🍬", "expense", "candy", S.fuchsia),
  cat("home", "Home", "🏠", "expense", "house", S.violet),
  cat("transport", "Transport", "🚗", "expense", "car", S.sky),
  cat("health", "Health & gym", "💪", "expense", "heart-pulse", S.rose),
  cat("beauty", "Beauty & care", "💅", "expense", "sparkle", S.pink),
  cat("shopping", "Shopping", "🛍️", "expense", "shopping-bag", S.amber),
  cat("subscriptions", "Subscriptions", "🔁", "expense", "repeat", S.cyan),
  cat("fun", "Fun & social", "🎉", "expense", "sparkles", S.yellow),
  cat("travel", "Travel", "✈️", "expense", "plane", S.teal),
  cat("gifts", "Gifts & family", "🎁", "expense", "gift", S.red),
  cat("learning", "Learning", "📚", "expense", "graduation-cap", S.indigo),
  cat("error", "Error", "⚠️", "expense", "triangle-alert", S.red),
  cat("other", "Other", "❓", "expense", "ellipsis", S.grey),
  cat("salary", "Salary", "💼", "income", "briefcase", S.green),
  cat("vales", "Vales", "🍽️", "income", "ticket", S.lime),
  cat("rent_income", "Rent income", "🏘️", "income", "building", S.teal),
  cat("gifts_received", "Gifts received", "🎁", "income", "gift", S.fuchsia),
  cat("sales", "Sales", "💸", "income", "tag", S.sky),
  cat("transfers_in", "Transfers in", "🔄", "income", "arrow-down-left", S.blue),
  cat("other_income", "Other income", "➕", "income", "plus", S.yellow),
  // "income" predates the set; its entries keep it until the review moves them.
  cat("income", "Income", "💰", "income", "coins", S.green),
  cat("investment", "Investment", "📈", "transfer", "trending-up", S.amber),
  cat("between_accounts", "Between accounts", "🔀", "transfer", "arrow-left-right", S.blue),
  cat("transfer", "Transfer", "🔀", "transfer", "arrow-left-right", S.indigo),
];

/**
 * The stored options with the set merged in: every stored option stays, in its order; known
 * values gain the label, emoji and kind they lack (an owner's own edits win); missing ones are
 * appended. Nothing is removed, so no entry ever loses its category.
 */
export function mergeCategoryOptions(stored: readonly SelectOption[]): SelectOption[] {
  const merged = stored.map((o) => {
    const known = CATEGORY_SET.find((c) => c.value === o.value);
    if (!known) return o;
    const filled: SelectOption = { ...o };
    if (filled.label === undefined && known.label !== undefined) filled.label = known.label;
    if (filled.emoji === undefined && known.emoji !== undefined) filled.emoji = known.emoji;
    if (filled.kind === undefined && known.kind !== undefined) filled.kind = known.kind;
    return filled;
  });
  for (const c of CATEGORY_SET) if (!merged.some((o) => o.value === c.value)) merged.push(c);
  return merged;
}

/** What a select option shows: its emoji and label, else its value. */
export const optionText = (o: Pick<SelectOption, "value" | "label" | "emoji">) =>
  `${o.emoji ? `${o.emoji} ` : ""}${o.label || o.value}`;

/**
 * Categories offered for a direction: its own kind, transfers (an investment can go either
 * way), and options with no kind (the owner's own, until given one).
 */
export const categoriesFor = (options: readonly SelectOption[], direction: "expense" | "income") =>
  options.filter(
    (o) =>
      o.archived !== true &&
      (o.kind === undefined || o.kind === direction || o.kind === "transfer"),
  );

/**
 * What a money item's category picker offers: the categories of its direction (see
 * `categoriesFor`) and the one it already has, so editing never hides or loses it. Without a
 * direction every live category shows.
 */
export function categoryChoices(
  options: readonly SelectOption[],
  direction: unknown,
  current: unknown,
): SelectOption[] {
  if (direction !== "expense" && direction !== "income")
    return options.filter((o) => o.archived !== true || o.value === current);
  const shown = categoriesFor(options, direction);
  const held = options.find((o) => o.value === current && !shown.includes(o));
  return held ? [...shown, held] : shown;
}

/** Category values that move money between the owner's own accounts. */
export function transferCategories(field: Field | undefined): Set<string> {
  return new Set((field?.options ?? []).filter((o) => o.kind === "transfer").map((o) => o.value));
}

export const kindOf = (field: Field | undefined, value: unknown): OptionKind | undefined =>
  field?.options?.find((o) => o.value === value)?.kind;
