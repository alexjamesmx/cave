import { fieldsOf, unresolved } from "../../../shared/fields.ts";
import { withAccounts } from "../../../shared/lists.ts";
import type { Field } from "../../../shared/schema.ts";
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

// One edit at a time, each from the latest stored fields: two quick edits (move, then rename)
// must not let the second start from the list as it was before the first.
let queue: Promise<unknown> = Promise.resolve();

/** Changes a collection's fields from what is stored now; shared lists are never saved as copies. */
export function editFields(
  local: LocalStore,
  collection: string,
  change: (fields: Field[]) => Field[],
): Promise<void> {
  const next = queue.then(async () => {
    const fields = fieldsOf(await local.get(collection));
    await local.write(
      { id: collection, kind: "collection", collection: null },
      { fields: unresolved(change(fields)) },
    );
  });
  queue = next.catch(() => {});
  return next;
}
