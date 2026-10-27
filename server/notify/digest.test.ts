import { beforeEach, expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import type { Zone } from "../../shared/recurrence.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import { digestLines } from "./digest.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const at = (utc: string) => Date.parse(utc);
// Thu 2026-10-15, 08:00 in Mexico City.
const EIGHT = at("2026-10-15T14:00:00Z");
const MINUTE = 60 * 1000;

let store: Store;
let tick = 1;

function write(
  id: string,
  kind: Doc["kind"],
  collection: string | null,
  data: Record<string, unknown>,
) {
  const stamp = formatStamp(EIGHT - 60 * MINUTE, tick++, "test");
  store.applyChanges(
    [
      {
        id,
        kind,
        collection,
        data,
        stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
        actor: "test",
      },
    ],
    "test",
    EIGHT - 60 * MINUTE,
  );
}

beforeEach(() => {
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
});

test("the lines: Needs you, what is due today or overdue, payments due today, the budget", () => {
  write("settings", "setting", null, { budget: { monthlyLimit: 10000 } });
  write("q1", "item", "tasks", {
    _title: "Answer: which card?",
    status: "todo",
    _askedBy: "claude",
  });
  write("p1", "item", "parts", { _title: "Deploy", status: "blocked", project: "proj-cave" });
  write("r1", "item", "reminders", { _title: "Dentist", due: "2026-10-15T17:30", repeat: "none" });
  write("r2", "item", "reminders", { _title: "Old one", due: "2026-10-10", repeat: "none" });
  write("r3", "item", "reminders", { _title: "Tomorrow", due: "2026-10-16", repeat: "none" });
  write("pay", "item", "payments", {
    _title: "Rent",
    due: "2026-10-15T09:00",
    amount: 12500,
    active: true,
  });
  write("e", "item", "money", {
    _title: "Tacos",
    amount: 2500,
    direction: "expense",
    date: "2026-10-03T13:00",
  });
  expect(digestLines(store, MX, EIGHT)).toEqual([
    "Needs you",
    "  ? Answer: which card?",
    "  Blocked: Deploy",
    "Due",
    "  Overdue · Old one",
    "  Today 17:30 · Dentist",
    "Payments due today",
    "  Rent · $12,500",
    "Budget: $2,500 of $10,000, $7,500 left, at this rate $5,167",
  ]);
});
