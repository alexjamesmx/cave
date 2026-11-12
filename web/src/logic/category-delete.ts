import type { SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";

export interface DeletePlan {
  /** The list without the deleted option. */
  options: SelectOption[];
  /** One write per live item that held it: the new value, or `null` for To review. */
  patches: { id: string; patch: Record<string, unknown> }[];
}

/** The live items whose `field` holds `value`. */
export const holding = (items: readonly Doc[], value: string, field = "category") =>
  items.filter((d) => d.data._deleted !== true && d.data[field] === value);

/**
 * Deleting an option (a category, or an account with `field` "account") for good: it leaves
 * the list, and every item that held it moves to `moveTo`, or to nothing, where it waits in
 * To review. Nothing here writes; the caller applies the plan through `local.write`.
 */
export function deleteCategoryPlan(
  options: readonly SelectOption[],
  items: readonly Doc[],
  value: string,
  moveTo?: string,
  field = "category",
): DeletePlan {
  return {
    options: options.filter((o) => o.value !== value),
    patches: holding(items, value, field).map((d) => ({
      id: d.id,
      patch: { [field]: moveTo || null },
    })),
  };
}

/** Puts a deleted option back where it stood in `before`, into the list as it is now. */
export function restoreOption(
  current: readonly SelectOption[],
  before: readonly SelectOption[],
  value: string,
): SelectOption[] {
  const option = before.find((o) => o.value === value);
  if (!option || current.some((o) => o.value === value)) return [...current];
  const at = before.indexOf(option);
  // Anchor on the option that stood before it, so edits made since keep their places.
  const prev = before
    .slice(0, at)
    .reverse()
    .find((o) => current.some((c) => c.value === o.value));
  const index = prev ? current.findIndex((c) => c.value === prev.value) + 1 : 0;
  return [...current.slice(0, index), option, ...current.slice(index)];
}
