import { expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { fieldsOf } from "../../../shared/fields.ts";
import { seedDocs } from "../../../shared/seed.ts";
import { moveOption, patchOption } from "../logic/options.ts";
import { openLocalDb } from "../store/db.ts";
import { LocalStore } from "../store/local-store.ts";
import { editFields } from "./lists.ts";

test("two quick edits of a list both land: the second starts from what the first stored", async () => {
  const db = openLocalDb(`cave-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  await db.docs.bulkPut(seedDocs());
  const local = await LocalStore.open({ db, deviceId: "laptop" });
  const priority = (fields: ReturnType<typeof fieldsOf>) =>
    fields.find((f) => f.id === "priority")?.options ?? [];
  const change = (fn: (o: ReturnType<typeof priority>) => ReturnType<typeof priority>) =>
    editFields(local, "tasks", (fields) =>
      fields.map((f) => (f.id === "priority" ? { ...f, options: fn(f.options ?? []) } : f)),
    );

  // Not awaited one by one: the way a click and a blur arrive together.
  await Promise.all([
    change((o) => moveOption(o, 2, 0)),
    change((o) => patchOption(o, "high", { label: "Urgent" })),
  ]);
  const options = priority(fieldsOf(await local.get("tasks")));
  expect(options.map((o) => o.value)).toEqual(["low", "high", "normal"]);
  expect(options.find((o) => o.value === "high")?.label).toBe("Urgent");
});
