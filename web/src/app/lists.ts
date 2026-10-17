import { fieldsOf } from "../../../shared/fields.ts";
import { withAccounts } from "../../../shared/lists.ts";
import type { LocalStore } from "../store/local-store.ts";

/** Adds `account` to money's accounts list when it is new, so the item that uses it validates. */
export async function ensureAccount(local: LocalStore, account: string): Promise<void> {
  const money = await local.get("money");
  const fields = fieldsOf(money);
  const list = fields.find((f) => f.id === "account");
  if (list?.type !== "select" || list.options?.some((o) => o.value === account)) return;
  await local.write(
    { id: "money", kind: "collection", collection: null },
    { fields: withAccounts(fields, [account]) },
  );
}
