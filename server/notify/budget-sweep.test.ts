import { beforeEach, expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import { createBudgetSweep } from "./budget-sweep.ts";
import { createSentLog, type Notifier, type SentLog } from "./notifier.ts";
import type { Notification } from "./types.ts";

const at = (utc: string) => Date.parse(utc);
const HOUR = 60 * 60 * 1000;

let store: Store;
let sent: SentLog;
let notified: Notification[];
let tick = 1;

function write(
  id: string,
  kind: Doc["kind"],
  collection: string | null,
  data: Record<string, unknown>,
  now = at("2026-10-15T16:00:00Z"),
) {
  const stamp = formatStamp(now, tick++, "test");
  const doc: Doc = {
    id,
    kind,
    collection,
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "test",
  };
  store.applyChanges([doc], "test", now);
}
const expense = (id: string, amount: number, date: string) =>
  write(id, "item", "money", { _title: id, amount, direction: "expense", date });

const notifier: Notifier = {
  statuses: () => [],
  async notify(n) {
    notified.push(n);
    return { delivered: 1, failed: 0 };
  },
};

beforeEach(() => {
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  sent = createSentLog(db);
  notified = [];
});

const run = (now: number) =>
  createBudgetSweep({ store, notifier, sent, timeZone: () => "America/Mexico_City" }).run({
    now,
  });
const NOW = at("2026-10-15T16:00:00Z");

test("without a limit the sweep skips and sends nothing", async () => {
  expense("a", 9000, "2026-10-02T10:00");
  expect(await run(NOW)).toMatchObject({ result: "skipped", didSomething: false });
  expect(notified).toEqual([]);
});

test("80% and 100% each notify once per month, with the numbers in the details only", async () => {
  write("settings", "setting", null, { budget: { monthlyLimit: 10000 } });
  expense("a", 7000, "2026-10-02T10:00");
  expect(await run(NOW)).toMatchObject({ result: "ok", didSomething: false });
  expense("b", 1500, "2026-10-10T10:00");
  await run(NOW);
  await run(NOW + HOUR);
  expect(notified.map((n) => n.title)).toEqual(["Budget · 80% spent this month"]);
  expect(notified[0]).toMatchObject({
    key: "budget:2026-10:80",
    kind: "budget",
    path: "/money/overview",
    details: ["$8,500 of $10,000", "$1,500 left", "At this rate: $17,567 by month end"],
  });
  expense("c", 2000, "2026-10-12T10:00");
  await run(NOW + 2 * HOUR);
  expect(notified.map((n) => n.title)).toEqual([
    "Budget · 80% spent this month",
    "Budget · over this month's limit",
  ]);
  expect(notified[1]?.details[1]).toBe("$500 over");
  // A new month starts clean: nothing crossed yet, nothing sent.
  const november = at("2026-11-03T16:00:00Z");
  expect(await run(november)).toMatchObject({ didSomething: false });
  expect(notified).toHaveLength(2);
});

test("transfers and other months never count against the limit", async () => {
  write("settings", "setting", null, { budget: { monthlyLimit: 1000 } });
  write("t", "item", "money", {
    _title: "to broker",
    amount: 5000,
    direction: "expense",
    category: "investment",
    date: "2026-10-03T10:00",
  });
  expense("old", 5000, "2026-09-03T10:00");
  await run(NOW);
  expect(notified).toEqual([]);
});
