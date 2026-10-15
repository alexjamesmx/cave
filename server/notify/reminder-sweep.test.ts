import { beforeEach, expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import { complete, snoozeTo, type Zone } from "../../shared/reminders.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import { createSentLog, type Notifier, type SentLog } from "./notifier.ts";
import { createReminderSweep, describeDue } from "./reminder-sweep.ts";
import type { Notification } from "./types.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const at = (utc: string) => Date.parse(utc);
// 2026-10-15 10:00 in Mexico City.
const NOW = at("2026-10-15T16:00:00Z");

let store: Store;
let sent: SentLog;
let notified: Notification[];
let tick = 1;
const db = () => openDb(":memory:");

function write(id: string, data: Record<string, unknown>) {
  const stamp = formatStamp(NOW, tick++, "test");
  const doc: Doc = {
    id,
    kind: "item",
    collection: "reminders",
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "test",
  };
  store.applyChanges([doc], "test", NOW);
}

const notifier: Notifier = {
  statuses: () => [],
  async notify(n) {
    notified.push(n);
    return { delivered: 1, failed: 0 };
  },
};

let database: ReturnType<typeof db>;
beforeEach(() => {
  database = db();
  store = createStore(database);
  store.seedIfEmpty(seedDocs(), 1);
  sent = createSentLog(database);
  notified = [];
});

const sweep = (s: SentLog = sent) =>
  createReminderSweep({ store, notifier, sent: s, zone: () => MX });
const run = (now: number, s?: SentLog) => sweep(s).run({ now });

test("a due reminder notifies once; one not yet due, done or deleted doesn't", async () => {
  write("due", { _title: "Pay rent", due: "2026-10-15T09:30", repeat: "monthly" });
  write("later", { _title: "Later", due: "2026-10-15T11:00" });
  write("done", { _title: "Done", due: "2026-10-15T09:00", done: true });
  write("gone", { _title: "Gone", due: "2026-10-15T09:00", _deleted: true });
  write("no-due", { _title: "No due" });

  expect(await run(NOW)).toEqual({ result: "ok", summary: "1 sent, 0 missed", didSomething: true });
  expect(notified).toEqual([
    {
      key: "reminder:due:2026-10-15T09:30",
      kind: "reminder",
      itemId: "due",
      title: "Pay rent",
      details: ["Thu Oct 15, 09:30", "Repeats monthly"],
      path: "/r/due",
      tag: "reminder:due",
      actions: [
        { id: "done", label: "Done", path: "/r/due?do=done" },
        { id: "snooze60", label: "Snooze 1h", path: "/r/due?do=snooze60" },
      ],
    },
  ]);
  expect(await run(NOW + 30_000)).toMatchObject({ didSomething: false });
  expect(notified).toHaveLength(1);
});

test("a key already sent never sends again, across a restart", async () => {
  write("r", { _title: "R", due: "2026-10-15T09:30" });
  await run(NOW);
  const restarted = createSentLog(database);
  await run(NOW + 60_000, restarted);
  expect(notified).toHaveLength(1);
});

test("a snoozed reminder and the next repeat notify again at their new time", async () => {
  write("r", { _title: "R", due: "2026-10-15T09:30", repeat: "daily" });
  await run(NOW);
  const doc = store.get("r") as Doc;
  write("r", snoozeTo(doc, "2026-10-15T10:30"));
  await run(NOW + 29 * 60_000);
  expect(notified).toHaveLength(1);
  await run(at("2026-10-15T16:31:00Z"));
  expect(notified.map((n) => n.key)).toEqual([
    "reminder:r:2026-10-15T09:30",
    "reminder:r:2026-10-15T10:30",
  ]);
  write("r", complete(store.get("r") as Doc, at("2026-10-15T16:32:00Z"), MX));
  expect(store.get("r")?.data.due).toBe("2026-10-16T09:30");
  await run(at("2026-10-16T15:30:30Z"));
  expect(notified.map((n) => n.key).at(-1)).toBe("reminder:r:2026-10-16T09:30");
});

test("after downtime: under 6 hours late is sent, over 6 hours is recorded as missed", async () => {
  write("recent", { _title: "Recent", due: "2026-10-15T05:00" });
  write("stale", { _title: "Stale", due: "2026-10-15T03:00" });
  expect(await run(NOW)).toEqual({ result: "ok", summary: "1 sent, 1 missed", didSomething: true });
  expect(notified.map((n) => n.itemId)).toEqual(["recent"]);
  expect(sent.missedCount()).toBe(1);
  await run(NOW + 30_000);
  expect(notified).toHaveLength(1);
});

test("a date-only reminder is due at the reminder time", async () => {
  write("d", { _title: "Water plants", due: "2026-10-15" });
  await run(at("2026-10-15T14:59:00Z"));
  expect(notified).toHaveLength(0);
  await run(at("2026-10-15T15:00:00Z"));
  expect(notified[0]?.details).toEqual(["Thu Oct 15, 09:00"]);
  expect(describeDue("2026-10-22T18:05", MX)).toBe("Thu Oct 22, 18:05");
});
