import { beforeEach, expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import { notificationSettings } from "../../shared/notifications.ts";
import type { Zone } from "../../shared/recurrence.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import { createDigestJob, digestLines } from "./digest.ts";
import { createSentLog, type Notifier, type SentLog } from "./notifier.ts";
import type { Notification } from "./types.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const at = (utc: string) => Date.parse(utc);
// Thu 2026-10-15, 08:00 in Mexico City.
const EIGHT = at("2026-10-15T14:00:00Z");
const MINUTE = 60 * 1000;

let store: Store;
let sent: SentLog;
let notified: { n: Notification; only: string[] | undefined }[];
let emailReady = true;
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

const notifier: Notifier = {
  statuses: () => [
    {
      id: "email",
      label: "Email",
      status: emailReady
        ? { ready: true, summary: "to a@b.c" }
        : { ready: false, summary: "needs" },
    },
  ],
  async notify(n, only) {
    notified.push({ n, only });
    return { delivered: 1, failed: 0 };
  },
};

beforeEach(() => {
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  sent = createSentLog(db);
  notified = [];
  emailReady = true;
});

const job = () =>
  createDigestJob({
    store,
    notifier,
    sent,
    zone: () => MX,
    settings: () => notificationSettings(store.get("settings")?.data),
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

test("one email a day at the digest time, email only, nothing before it or without a time", async () => {
  write("r1", "item", "reminders", { _title: "Dentist", due: "2026-10-15T17:30", repeat: "none" });
  expect(await job().run({ now: EIGHT })).toMatchObject({
    result: "skipped",
    summary: "no digest time set",
  });
  write("settings", "setting", null, { notifications: { channels: ["webpush"], digest: "08:30" } });
  expect(await job().run({ now: EIGHT })).toMatchObject({
    result: "skipped",
    summary: "waiting for 08:30",
  });
  expect(await job().run({ now: EIGHT + 30 * MINUTE })).toMatchObject({
    result: "ok",
    didSomething: true,
  });
  expect(notified).toHaveLength(1);
  expect(notified[0]?.only).toEqual(["email"]);
  expect(notified[0]?.n).toMatchObject({
    key: "digest:2026-10-15",
    kind: "digest",
    title: "Your day · Oct 15",
    details: ["Due", "  Today 17:30 · Dentist"],
    path: "/projects/scene",
  });
  // Later the same day: sent already. Nothing is sent twice.
  expect(await job().run({ now: EIGHT + 90 * MINUTE })).toMatchObject({ summary: "sent today" });
  expect(notified).toHaveLength(1);
});

test("email not ready: it waits; an empty day sends nothing and counts as done", async () => {
  write("settings", "setting", null, { notifications: { channels: ["webpush"], digest: "08:00" } });
  emailReady = false;
  expect(await job().run({ now: EIGHT })).toMatchObject({
    result: "skipped",
    summary: "email is not ready",
  });
  emailReady = true;
  expect(await job().run({ now: EIGHT })).toMatchObject({
    result: "ok",
    summary: "nothing to tell today",
  });
  expect(notified).toEqual([]);
  expect(await job().run({ now: EIGHT + MINUTE })).toMatchObject({ summary: "sent today" });
});
