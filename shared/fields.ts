import type { Field } from "./schema.ts";
import type { Doc } from "./types.ts";

export interface FieldError {
  key: string;
  error: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Time stays optional with `withTime`: ledger entries imported from the vault are often date-only.
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function isCalendarDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isDateValue(value: unknown, withTime: boolean): boolean {
  if (typeof value !== "string") return false;
  const m = (withTime ? DATE_TIME_RE : DATE_RE).exec(value);
  if (!m) return false;
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map((part) => Number(part ?? 0));
  return isCalendarDate(y as number, mo as number, d as number) && h < 24 && mi < 60 && s < 60;
}

// Values become link targets on every device, so script-running schemes are refused.
const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function isSafeUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  return LINK_PROTOCOLS.has(new URL(value).protocol);
}

function check(field: Field, value: unknown): string | undefined {
  switch (field.type) {
    case "text":
      return typeof value === "string" ? undefined : "must be a string";
    case "url":
      return isSafeUrl(value) ? undefined : "must be an http, https or mailto link";
    case "number":
    case "money":
      return typeof value === "number" && Number.isFinite(value)
        ? undefined
        : "must be a finite number";
    case "checkbox":
      return typeof value === "boolean" ? undefined : "must be true or false";
    case "date": {
      const withTime = field.config?.withTime === true;
      if (isDateValue(value, withTime)) return undefined;
      return withTime ? "must be YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss]" : "must be YYYY-MM-DD";
    }
    case "select":
      return field.options?.some((o) => o.value === value)
        ? undefined
        : `must be one of: ${(field.options ?? []).map((o) => o.value).join(", ")}`;
  }
}

export interface ValidateOptions {
  /**
   * Whether a select value must be one of the field's current options. Device writes and
   * the importer check it; sync does not, so a value whose option was removed later still
   * syncs (and shows greyed out) instead of blocking every later push of that item.
   */
  selectMembership?: boolean;
}

/**
 * Checks the values in `data` that belong to an active field. `null` clears a field and is
 * always valid; keys that are not fields (`_title`, imported extras) and values of archived
 * fields are left alone.
 */
export function validateFields(
  fields: readonly Field[],
  data: Record<string, unknown>,
  { selectMembership = true }: ValidateOptions = {},
): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of activeFields(fields)) {
    if (!Object.hasOwn(data, field.id)) continue;
    const value = data[field.id];
    if (value === null) continue;
    if (field.type === "select" && !selectMembership) {
      if (typeof value !== "string") errors.push({ key: field.id, error: "must be a string" });
      continue;
    }
    const error = check(field, value);
    if (error) errors.push({ key: field.id, error });
  }
  return errors;
}

/** Fields the owner has not removed; views, the drawer and the command bar show only these. */
export const activeFields = (fields: readonly Field[]): Field[] =>
  fields.filter((f) => f.archived !== true);

/** A collection doc's field list; collection docs are not shape-checked, so stay defensive. */
export function fieldsOf(collection: Doc | undefined): Field[] {
  const fields = collection?.data.fields;
  return Array.isArray(fields) ? (fields as Field[]) : [];
}

export const formatFieldErrors = (errors: readonly FieldError[]) =>
  errors.map((e) => `field ${e.key}: ${e.error}`).join("; ");

export class FieldValueError extends Error {
  constructor(readonly errors: readonly FieldError[]) {
    super(formatFieldErrors(errors));
    this.name = "FieldValueError";
  }
}
