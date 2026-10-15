import { expect, test } from "bun:test";
import {
  type ChannelId,
  DEFAULT_NOTIFICATIONS,
  type NotificationSettings,
} from "../../shared/notifications.ts";
import { openDb } from "../db.ts";
import { createNotifier, createSentLog } from "./notifier.ts";
import type { ChannelStatus, Message, Notification, NotificationChannel } from "./types.ts";

const ORIGIN = "https://cave.example.dev";

function fake(id: ChannelId, status: ChannelStatus = { ready: true, summary: "ready" }) {
  const sent: Message[] = [];
  const channel: NotificationChannel & { sent: Message[]; fail?: boolean } = {
    id,
    label: id,
    sent,
    status: () => status,
    async send(message) {
      if (channel.fail) throw new TypeError("network down");
      sent.push(message);
      return { delivered: 1, failed: 0 };
    },
  };
  return channel;
}

const rent: Notification = {
  key: "reminder:r1:2026-10-22T09:00",
  kind: "reminder",
  itemId: "r1",
  title: "Pay rent",
  details: ["Thu Oct 22, 09:00", "Repeats monthly", "$16,842"],
  path: "/r/r1",
  tag: "reminder:r1",
  actions: [
    { id: "done", label: "Done", path: "/r/r1?do=done" },
    { id: "snooze60", label: "Snooze 1h", path: "/r/r1?do=snooze60" },
  ],
};

function setup(settings: NotificationSettings, channels: NotificationChannel[]) {
  const db = openDb(":memory:");
  const lines: string[] = [];
  const notifier = createNotifier({
    channels,
    settings: () => settings,
    db,
    now: () => 1_000,
    origin: ORIGIN,
    log: (l) => lines.push(l),
  });
  const rows = () =>
    db
      .query<{ key: string; channel: string; result: string }, []>(
        "SELECT key, channel, result FROM notification_log ORDER BY seq",
      )
      .all();
  return { notifier, rows, lines, db };
}

test("the defaults send to Web Push only, with full detail and absolute links", async () => {
  const webpush = fake("webpush");
  const telegram = fake("telegram");
  const { notifier, rows } = setup(DEFAULT_NOTIFICATIONS, [webpush, telegram]);
  expect(await notifier.notify(rent)).toEqual({ delivered: 1, failed: 0 });
  expect(telegram.sent).toEqual([]);
  expect(webpush.sent).toEqual([
    {
      kind: "reminder",
      itemId: "r1",
      title: "Pay rent",
      body: "Thu Oct 22, 09:00 · Repeats monthly · $16,842",
      url: "https://cave.example.dev/r/r1",
      tag: "reminder:r1",
      actions: [
        { id: "done", label: "Done", url: "https://cave.example.dev/r/r1?do=done" },
        { id: "snooze60", label: "Snooze 1h", url: "https://cave.example.dev/r/r1?do=snooze60" },
      ],
    },
  ]);
  expect(rows()).toEqual([{ key: rent.key, channel: "webpush", result: "ok" }]);
});

test("titles detail never lets an amount, time or field value reach Telegram or Discord", async () => {
  const telegram = fake("telegram");
  const discord = fake("discord");
  const settings = { ...DEFAULT_NOTIFICATIONS, channels: ["telegram", "discord"] as ChannelId[] };
  const { notifier } = setup(settings, [telegram, discord]);
  await notifier.notify(rent);
  for (const message of [...telegram.sent, ...discord.sent]) {
    expect(message.body).toBeUndefined();
    const text = JSON.stringify(message);
    for (const detail of rent.details) expect(text).not.toContain(detail);
    expect(message.title).toBe("Pay rent");
    expect(message.url).toBe("https://cave.example.dev/r/r1");
  }
  expect(telegram.sent).toHaveLength(1);
  expect(discord.sent).toHaveLength(1);
});

test("a named channel overrides the defaults; one not ready or failing is logged, not thrown", async () => {
  const webpush = fake("webpush", { ready: false, summary: "needs keys" });
  const telegram = fake("telegram");
  telegram.fail = true;
  const discord = fake("discord");
  const { notifier, rows, lines } = setup(DEFAULT_NOTIFICATIONS, [webpush, telegram, discord]);
  const result = await notifier.notify(rent, ["webpush", "telegram", "discord"]);
  expect(result).toEqual({ delivered: 1, failed: 1 });
  expect(rows().map((r) => [r.channel, r.result])).toEqual([
    ["webpush", "skipped: needs keys"],
    ["telegram", "failed: TypeError"],
    ["discord", "ok"],
  ]);
  for (const line of lines) expect(line).not.toContain("Pay rent");
});

test("the sent log remembers keys across channels and counts missed reminders", () => {
  const db = openDb(":memory:");
  const sent = createSentLog(db);
  expect(sent.wasSent("reminder:a:1")).toBe(false);
  sent.markSent("reminder:a:1", "a", 1, { delivered: 2, failed: 0 });
  sent.markMissed("reminder:b:1", "b", 2);
  expect(sent.wasSent("reminder:a:1")).toBe(true);
  expect(sent.wasSent("reminder:b:1")).toBe(true);
  expect(sent.missedCount()).toBe(1);
});
