import type { Field, OptionKind, SelectOption } from "./schema.ts";

/**
 * The money categories (M7b part 5). `value` is what items store and never changes; `label`
 * and `emoji` are what the app shows, and the owner can edit both. Existing values keep their
 * ids: "health" shows as "Health & gym" without rewriting a single entry.
 */
const C = {
  orange: "#FF9F43",
  violet: "#8B7CFF",
  cyan: "#3DE0FF",
  expense: "#FF5C7A",
  purple: "#C77DFF",
  grey: "#8C93A0",
  gold: "#F5C451",
  income: "#2EE6A6",
  lime: "#B6FF3B",
};

const cat = (
  value: string,
  label: string,
  emoji: string,
  kind: OptionKind,
  icon: string,
  color: string,
): SelectOption => ({ value, label, emoji, kind, icon, color });

export const CATEGORY_SET: SelectOption[] = [
  cat("food", "Food", "🍔", "expense", "utensils", C.orange),
  cat("groceries", "Groceries", "🛒", "expense", "shopping-cart", C.lime),
  cat("gula", "Gula", "🍬", "expense", "candy", C.purple),
  cat("home", "Home", "🏠", "expense", "house", C.violet),
  cat("transport", "Transport", "🚗", "expense", "car", C.cyan),
  cat("health", "Health & gym", "💪", "expense", "heart-pulse", C.expense),
  cat("beauty", "Beauty & care", "💅", "expense", "sparkle", C.purple),
  cat("shopping", "Shopping", "🛍️", "expense", "shopping-bag", C.orange),
  cat("subscriptions", "Subscriptions", "🔁", "expense", "repeat", C.cyan),
  cat("fun", "Fun & social", "🎉", "expense", "sparkles", C.purple),
  cat("travel", "Travel", "✈️", "expense", "plane", C.cyan),
  cat("gifts", "Gifts & family", "🎁", "expense", "gift", C.expense),
  cat("learning", "Learning", "📚", "expense", "graduation-cap", C.violet),
  cat("error", "Error", "⚠️", "expense", "triangle-alert", C.expense),
  cat("other", "Other", "❓", "expense", "ellipsis", C.grey),
  cat("salary", "Salary", "💼", "income", "briefcase", C.income),
  cat("vales", "Vales", "🍽️", "income", "ticket", C.income),
  cat("rent_income", "Rent income", "🏘️", "income", "building", C.income),
  cat("gifts_received", "Gifts received", "🎁", "income", "gift", C.income),
  cat("sales", "Sales", "💸", "income", "tag", C.income),
  cat("transfers_in", "Transfers in", "🔄", "income", "arrow-down-left", C.income),
  cat("other_income", "Other income", "➕", "income", "plus", C.income),
  // "income" predates the set; its entries keep it until the review moves them.
  cat("income", "Income", "💰", "income", "coins", C.income),
  cat("investment", "Investment", "📈", "transfer", "trending-up", C.gold),
  cat("between_accounts", "Between accounts", "🔀", "transfer", "arrow-left-right", C.lime),
  cat("transfer", "Transfer", "🔀", "transfer", "arrow-left-right", C.lime),
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
  options.filter((o) => o.kind === undefined || o.kind === direction || o.kind === "transfer");

/** Category values that move money between the owner's own accounts. */
export function transferCategories(field: Field | undefined): Set<string> {
  return new Set((field?.options ?? []).filter((o) => o.kind === "transfer").map((o) => o.value));
}

export const kindOf = (field: Field | undefined, value: unknown): OptionKind | undefined =>
  field?.options?.find((o) => o.value === value)?.kind;
