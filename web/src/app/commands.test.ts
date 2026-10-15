import { beforeEach, expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { FieldValueError } from "../../../shared/fields.ts";
import { seedDocs } from "../../../shared/seed.ts";
import { openLocalDb } from "../store/db.ts";
import { LocalStore } from "../store/local-store.ts";
import { runCommand } from "./commands.ts";

const now = new Date("2026-10-13T03:30:00Z");
const timeZone = "America/Mexico_City";
let local: LocalStore;

beforeEach(async () => {
  const db = openLocalDb(`cave-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  await db.docs.bulkPut(seedDocs());
  local = await LocalStore.open({ db, deviceId: "laptop", now: () => now.getTime() });
});

const items = (collection: string) =>
  local.db.docs.where("collection").equals(collection).toArray();
const run = (cmd: Parameters<typeof runCommand>[0]) => runCommand(cmd, { local, timeZone, now });

test("a money entry is stamped with local time and only a given category", async () => {
  const result = await run({
    kind: "money",
    amount: 205,
    direction: "expense",
    category: undefined,
    title: "tacos",
  });
  expect(result.message).toBe("Logged −$205 tacos · untagged");
  const [doc] = await items("money");
  expect(doc?.data).toMatchObject({ amount: 205, direction: "expense", date: "2026-10-12T21:30" });
  expect(doc?.data).not.toHaveProperty("category");
});

test("an unknown category is refused by field validation, nothing is written", async () => {
  const cmd = {
    kind: "money",
    amount: 5,
    direction: "expense",
    category: "gifts",
    title: "",
  } as const;
  await expect(run(cmd)).rejects.toThrow(FieldValueError);
  expect(await items("money")).toHaveLength(0);
});

test("todo adds an open task", async () => {
  await run({ kind: "task", title: "ship v0.1" });
  const [doc] = await items("tasks");
  expect(doc?.data).toMatchObject({ _title: "ship v0.1", status: "todo" });
});

test("a habit toggles today's journal entry, creating it once", async () => {
  await run({ kind: "habit", habit: "gym" });
  await run({ kind: "habit", habit: "reading" });
  let journal = await items("journal");
  expect(journal).toHaveLength(1);
  expect(journal[0]?.data).toMatchObject({ date: "2026-10-12", gym: true, reading: true });

  const result = await run({ kind: "habit", habit: "gym" });
  expect(result.message).toBe("gym undone for today");
  journal = await items("journal");
  expect(journal[0]?.data.gym).toBe(false);
});

test("jump returns a path; ask and reject explain themselves", async () => {
  expect(await run({ kind: "jump", path: "/c/money" })).toMatchObject({ path: "/c/money" });
  expect((await run({ kind: "ask", question: "x" })).ok).toBe(false);
  expect(await run({ kind: "reject", hint: "Try todo" })).toEqual({
    ok: false,
    message: "Try todo",
  });
});

test("a reminder is saved open, with its due and repeat", async () => {
  const result = await run({
    kind: "reminder",
    title: "Pay rent",
    due: "2026-10-22T09:00",
    repeat: "monthly",
    preview: "Reminder · Pay rent · Thu Oct 22, 09:00 · monthly",
  });
  expect(result).toEqual({
    ok: true,
    message: "Saved · Reminder · Pay rent · Thu Oct 22, 09:00 · monthly",
  });
  const [doc] = await items("reminders");
  expect(doc?.data).toMatchObject({
    _title: "Pay rent",
    due: "2026-10-22T09:00",
    repeat: "monthly",
    done: false,
  });
});
