import type { CollectionData, Field, SelectOption } from "./schema.ts";
import type { Doc, Kind } from "./types.ts";

/**
 * One list per kind of choice (M7c part 3). Money's `category` and `account` are the sources;
 * payments show them through `optionsFrom` instead of keeping copies.
 */

type SeedDoc = { id: string; kind: Kind; collection?: string; data: Record<string, unknown> };

const accountOption = (value: string): SelectOption => ({
  value,
  icon: "landmark",
  color: "#8C93A0",
});

export const MONEY_ACCOUNT: Field = { id: "account", name: "Account", type: "select", options: [] };

export const PAYMENT_CATEGORY: Field = {
  id: "category",
  name: "Category",
  type: "select",
  config: { optionsFrom: { collection: "money", field: "category", kinds: ["expense"] } },
};

export const PAYMENT_ACCOUNT: Field = {
  id: "account",
  name: "Account",
  type: "select",
  config: { optionsFrom: { collection: "money", field: "account" } },
};

/** `options` with `value` added at the end, unless it is there already (archived or not). */
function withOption(
  options: readonly SelectOption[],
  value: string,
  make: (value: string) => SelectOption,
): SelectOption[] {
  return options.some((o) => o.value === value) ? [...options] : [...options, make(value)];
}

/** Every distinct non-empty string `field` holds in `docs`, exactly as stored, sorted. */
export const distinctValues = (docs: Doc[], field: string) =>
  [
    ...new Set(
      docs.map((d) => d.data[field]).filter((v): v is string => typeof v === "string" && v !== ""),
    ),
  ].sort();

const fieldsIn = (doc: Doc | undefined): Field[] | undefined => {
  if (doc?.kind !== "collection" || doc.data._deleted === true) return undefined;
  const fields = (doc.data as unknown as CollectionData).fields;
  return Array.isArray(fields) ? fields : undefined;
};

/**
 * Seed migration 10, computed from what the database holds. No item is rewritten:
 * - money's `account` becomes a select whose options are the account strings items already
 *   hold, so every stored value stays valid;
 * - money's `detail` is archived (values kept);
 * - payments' `category` and `account` take money's lists; a category a payment uses that
 *   money lacks is added to money's list as an expense, with the payment option's look.
 */
export function listsMigration(
  get: (id: string) => Doc | undefined,
  items: (collection: string) => Doc[],
): SeedDoc[] {
  const docs: SeedDoc[] = [];
  const money = fieldsIn(get("money"));
  const payments = fieldsIn(get("payments"));
  if (!money) return docs;

  let next = money.map((f) => ({ ...f }));
  const account = next.find((f) => f.id === "account");
  if (account && account.type !== "select") {
    const values = distinctValues([...items("money"), ...items("payments")], "account");
    Object.assign(account, { type: "select", options: values.map(accountOption) });
  }
  const detail = next.find((f) => f.id === "detail");
  if (detail && detail.archived !== true) detail.archived = true;

  const paymentCategory = payments?.find((f) => f.id === "category");
  if (paymentCategory && !paymentCategory.config?.optionsFrom) {
    const used = new Set(distinctValues(items("payments"), "category"));
    next = next.map((f) => {
      if (f.id !== "category") return f;
      let options = f.options ?? [];
      for (const value of used) {
        const look = paymentCategory.options?.find((o) => o.value === value);
        options = withOption(options, value, () => ({
          ...(look ?? { value, icon: "tag", color: "#8C93A0" }),
          kind: "expense",
        }));
      }
      return { ...f, options };
    });
  }
  if (JSON.stringify(next) !== JSON.stringify(money))
    docs.push({ id: "money", kind: "collection", data: { fields: next } });

  if (payments) {
    const shared = payments.map((f) => {
      if (f.id === "category" && !f.config?.optionsFrom)
        return { ...PAYMENT_CATEGORY, name: f.name };
      if (f.id === "account" && !f.config?.optionsFrom) return { ...PAYMENT_ACCOUNT, name: f.name };
      return f;
    });
    if (JSON.stringify(shared) !== JSON.stringify(payments))
      docs.push({ id: "payments", kind: "collection", data: { fields: shared } });
  }
  return docs;
}

/** Money's fields with `values` added to the accounts list (sample data, "New account"). */
export const withAccounts = (fields: readonly Field[], values: readonly string[]): Field[] =>
  fields.map((f) =>
    f.id === "account" && f.type === "select"
      ? { ...f, options: values.reduce((o, v) => withOption(o, v, accountOption), f.options ?? []) }
      : f,
  );
