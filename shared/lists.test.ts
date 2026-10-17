import { expect, test } from "bun:test";
import { fieldsOf, resolveFields, validateFields } from "./fields.ts";
import { listsMigration, PAYMENT_ACCOUNT, PAYMENT_CATEGORY, withAccounts } from "./lists.ts";
import { PAYMENTS_COLLECTION } from "./payments.ts";
import type { Field } from "./schema.ts";
import type { Doc } from "./types.ts";

const doc = (
  id: string,
  kind: Doc["kind"],
  data: Record<string, unknown>,
  collection: string | null = null,
): Doc => ({
  id,
  kind,
  collection,
  data,
  stamps: {},
  actor: "user:t",
});

const oldMoney: Field[] = [
  { id: "amount", name: "Amount", type: "money" },
  {
    id: "category",
    name: "Category",
    type: "select",
    options: [{ value: "food", icon: "utensils", color: "#fff", kind: "expense" }],
  },
  { id: "detail", name: "Detail", type: "text" },
  { id: "account", name: "Account", type: "text" },
];
const oldPayments: Field[] = [
  {
    id: "category",
    name: "Category",
    type: "select",
    options: [
      { value: "food", icon: "utensils", color: "#fff", kind: "expense" },
      { value: "streaming", icon: "tv", color: "#f00", emoji: "📺" },
    ],
  },
  { id: "account", name: "Account", type: "text" },
];

function world() {
  const docs = new Map<string, Doc>([
    ["money", doc("money", "collection", { name: "Money", fields: oldMoney })],
    ["payments", doc("payments", "collection", { name: "Payments", fields: oldPayments })],
  ]);
  const items: Record<string, Doc[]> = {
    money: [
      doc("m1", "item", { account: "Nu", detail: "Tacos", category: "food" }, "money"),
      doc("m2", "item", { account: "BBVA" }, "money"),
      doc("m3", "item", { account: "  " }, "money"),
    ],
    payments: [doc("p1", "item", { account: "Edenred", category: "streaming" }, "payments")],
  };
  return { get: (id: string) => docs.get(id), items: (c: string) => items[c] ?? [], docs };
}

test("migration 10 turns accounts into a list of the values items hold, and rewrites no item", () => {
  const { get, items } = world();
  const out = listsMigration(get, items);
  expect(out.map((d) => [d.id, d.kind])).toEqual([
    ["money", "collection"],
    ["payments", "collection"],
  ]);
  const money = out[0]?.data.fields as Field[];
  const account = money.find((f) => f.id === "account");
  expect(account?.type).toBe("select");
  expect(account?.options?.map((o) => o.value)).toEqual(["  ", "BBVA", "Edenred", "Nu"]);
  expect(money.find((f) => f.id === "detail")?.archived).toBe(true);
  // A category only payments used joins money's list as an expense, with its look.
  expect(money.find((f) => f.id === "category")?.options?.at(-1)).toEqual({
    value: "streaming",
    icon: "tv",
    color: "#f00",
    emoji: "📺",
    kind: "expense",
  });
  const payments = out[1]?.data.fields as Field[];
  expect(payments).toEqual([PAYMENT_CATEGORY, PAYMENT_ACCOUNT]);
});

test("after migration 10 every stored value is still valid, and running it again does nothing", () => {
  const { get, items, docs } = world();
  for (const d of listsMigration(get, items)) {
    const before = docs.get(d.id) as Doc;
    docs.set(d.id, { ...before, data: { ...before.data, ...d.data } });
  }
  const resolved = (c: string) => resolveFields(fieldsOf(docs.get(c)), (id) => docs.get(id));
  for (const [c, list] of Object.entries({ money: items("money"), payments: items("payments") }))
    for (const item of list)
      expect({ id: item.id, errors: validateFields(resolved(c), item.data) }).toEqual({
        id: item.id,
        errors: [],
      });
  expect(listsMigration(get, items)).toEqual([]);
});

test("payments offer money's expense categories and its accounts, from one list", () => {
  const { get, items, docs } = world();
  for (const d of listsMigration(get, items)) {
    const before = docs.get(d.id) as Doc;
    docs.set(d.id, { ...before, data: { ...before.data, ...d.data } });
  }
  const money = docs.get("money") as Doc;
  const fields = withAccounts(fieldsOf(money), ["Cash"]);
  docs.set("money", { ...money, data: { ...money.data, fields } });
  const payments = resolveFields(PAYMENTS_COLLECTION.fields, (id) => docs.get(id));
  expect(payments.find((f) => f.id === "account")?.options?.map((o) => o.value)).toEqual([
    "  ",
    "BBVA",
    "Edenred",
    "Nu",
    "Cash",
  ]);
  expect(payments.find((f) => f.id === "category")?.options?.map((o) => o.value)).toEqual([
    "food",
    "streaming",
  ]);
});

test("an archived option is refused for a new value and named as archived", () => {
  const fields: Field[] = [
    {
      id: "account",
      name: "Account",
      type: "select",
      options: [
        { value: "Nu", icon: "landmark", color: "#888" },
        { value: "Old bank", icon: "landmark", color: "#888", archived: true },
      ],
    },
  ];
  expect(validateFields(fields, { account: "Nu" })).toEqual([]);
  expect(validateFields(fields, { account: "Old bank" })[0]?.error).toContain("archived");
  expect(validateFields(fields, { account: "Bank" })[0]?.error).toBe("must be one of: Nu");
  // Sync doesn't check membership, so an old item keeps syncing.
  expect(validateFields(fields, { account: "Old bank" }, { selectMembership: false })).toEqual([]);
});
