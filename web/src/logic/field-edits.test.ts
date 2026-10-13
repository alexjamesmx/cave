import { expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { fieldsOf } from "../../../shared/fields.ts";
import type { Field } from "../../../shared/schema.ts";
import { seedDocs } from "../../../shared/seed.ts";
import { openLocalDb } from "../store/db.ts";
import { LocalStore } from "../store/local-store.ts";
import { addField, archiveField, fieldId, restoreField } from "./field-edits.ts";

test("a removed field's id cannot be reused, and its values are untouched", async () => {
  const db = openLocalDb(`cave-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  await db.docs.bulkPut(seedDocs());
  const local = await LocalStore.open({ db, deviceId: "laptop" });
  const money = { id: "money", kind: "collection", collection: null } as const;
  await local.write({ id: "m1", kind: "item", collection: "money" }, { amount: 593 });

  const archived = archiveField(fieldsOf(await local.get("money")), "amount");
  await local.write(money, { fields: archived });

  const result = addField(fieldsOf(await local.get("money")), "Amount", "text");
  expect(result).toEqual({
    error: "“Amount” was removed and still holds values; restore it instead.",
  });
  expect((await local.get("m1"))?.data.amount).toBe(593);
  const amount = fieldsOf(await local.get("money")).find((f) => f.id === "amount");
  expect(amount).toMatchObject({ type: "money", archived: true });
});

test("archived fields skip validation; restoring brings the field back as it was", () => {
  const fields: Field[] = [{ id: "due", name: "Due", type: "date" }];
  const archived = archiveField(fields, "due");
  expect(archived[0]?.archived).toBe(true);
  expect(restoreField(archived, "due")).toEqual(fields);
});

test("new fields get a slug id and select fields start with no options", () => {
  expect(fieldId(" Next step! ")).toBe("next_step");
  expect(fieldId("2nd try")).toBe("f_2nd_try");
  expect(addField([], "Mood", "select")).toEqual({
    fields: [{ id: "mood", name: "Mood", type: "select", options: [] }],
  });
  expect(addField([{ id: "mood", name: "Mood", type: "text" }], "mood", "text")).toEqual({
    error: "A field “mood” already exists.",
  });
  expect(addField([], "!!!", "text")).toHaveProperty("error");
});
