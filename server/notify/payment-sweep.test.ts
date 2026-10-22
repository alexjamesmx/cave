import { beforeEach, expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import { paidPatch } from "../../shared/payments.ts";
import type { Zone } from "../../shared/recurrence.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import { createSentLog, type Notifier, type SentLog } from "./notifier.ts";
import { createPaymentSweep } from "./payment-sweep.ts";
import type { Notification } from "./types.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const at = (utc: string) => Date.parse(utc);
const HOUR = 60 * 60 * 1000;

let store: Store;
let sent: SentLog;
let notified: Notification[];
let tick = 1;

function write(id: string, data: Record<string, unknown>, now = at("2026-10-15T16:00:00Z")) {
  const stamp = formatStamp(now, tick++, "test");
  const doc: Doc = {
    id,
    kind: "item",
    collection: "payments",
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "test",
  };
  store.applyChanges([doc], "test", now);
}

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
  createPaymentSweep({ store, notifier, sent, zone: () => MX }).run({ now });
const titles = () => notified.map((n) => n.title);

// A bill due Fri 2026-10-16 at 09:00 in Mexico City (15:00 UTC).
const DUE = "2026-10-16T09:00";
const DUE_AT = at("2026-10-16T15:00:00Z");

test("a payment due tomorrow notifies once the day before and once on the day", async () => {
  write("nu", { _title: "Nu card", due: DUE, amount: 3000, active: true });
  await run(DUE_AT - 24 * HOUR - 1);
  expect(notified).toEqual([]);
  await run(DUE_AT - 24 * HOUR);
  await run(DUE_AT - 23 * HOUR);
  expect(titles()).toEqual(["Nu card · due tomorrow"]);
  await run(DUE_AT);
  await run(DUE_AT + HOUR);
  expect(titles()).toEqual(["Nu card · due tomorrow", "Nu card · due today"]);
  expect(notified[0]).toMatchObject({
    key: `payment:nu:${DUE}:before`,
    kind: "payment",
    path: "/money/payments",
    details: ["Fri Oct 16, 09:00", "$3,000"],
  });
});

test("notify_days moves the first notice; an autopay payment only says it was charged, on the day", async () => {
  write("rent", { _title: "Rent", due: DUE, notify_days: 3, active: true });
  write("netflix", { _title: "Netflix", due: DUE, autopay: true, active: true });
  await run(DUE_AT - 3 * 24 * HOUR);
  expect(titles()).toEqual(["Rent · due in 3 days"]);
  await run(DUE_AT);
  expect(titles()).toEqual(["Rent · due in 3 days", "Rent · due today", "Netflix · charged today"]);
});

test("no due date, inactive or deleted: never notified", async () => {
  write("nodate", { _title: "Needs date", active: true });
  write("off", { _title: "Off", due: DUE, active: false });
  write("gone", { _title: "Gone", due: DUE, _deleted: true });
  await run(DUE_AT - 24 * HOUR);
  await run(DUE_AT);
  expect(notified).toEqual([]);
});

test("paid or advanced, it notifies for the new date only, never again for the old one", async () => {
  write("nu", { _title: "Nu card", due: DUE, repeat: "monthly", active: true });
  await run(DUE_AT - 24 * HOUR);
  const doc = store.get("nu") as Doc;
  write("nu", paidPatch(doc, DUE_AT - 20 * HOUR, MX), DUE_AT - 20 * HOUR);
  await run(DUE_AT);
  expect(titles()).toEqual(["Nu card · due tomorrow"]);
  expect(store.get("nu")?.data.due).toBe("2026-11-16T09:00");
});

test("a notice seen too late is recorded as missed, and a day-before notice after the due time is dropped", async () => {
  write("late", { _title: "Late", due: DUE, active: true });
  expect(await run(DUE_AT + 7 * HOUR)).toMatchObject({ summary: "0 sent, 2 missed" });
  expect(notified).toEqual([]);
  expect(await run(DUE_AT + 8 * HOUR)).toMatchObject({ summary: "0 sent, 0 missed" });
});

test("a notice timed before the payment existed is skipped, not counted as missed", async () => {
  // Added at 22:13 the evening before: the day-before notice (09:00 that morning) never applied.
  const created = at("2026-10-16T04:13:00Z");
  write(
    "new",
    { _title: "New", due: DUE, active: true, _created: new Date(created).toISOString() },
    created,
  );
  expect(await run(created + 60_000)).toMatchObject({ summary: "0 sent, 0 missed" });
  expect(sent.missedCount()).toBe(0);
  expect(await run(DUE_AT)).toMatchObject({ summary: "1 sent, 0 missed" });
  expect(titles()).toEqual(["New · due today"]);
});
