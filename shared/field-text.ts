import { optionText } from "./categories.ts";
import type { Field } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * A field's value as a migrated note shows it (seed migrations 26 and 27); `undefined` when it
 * holds nothing worth writing down.
 */
export function valueText(
  field: Field | undefined,
  value: unknown,
  get: (id: string) => Doc | undefined,
): string | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  if (value === true) return "yes";
  if (field?.type === "select" && typeof value === "string") {
    const option = field.options?.find((o) => o.value === value);
    return option ? optionText(option) : value;
  }
  // A ref reads as what it points at, even a retired project, so the line still means something.
  if (field?.type === "ref" && typeof value === "string") {
    const title = get(value)?.data._title;
    return typeof title === "string" && title.trim() ? title.trim() : value;
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}
