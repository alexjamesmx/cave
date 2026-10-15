import { beforeEach, expect, test } from "bun:test";
import { formatStamp } from "../../shared/hlc.ts";
import { DEFAULT_NOTIFICATIONS, type NotificationSettings } from "../../shared/notifications.ts";
import type { Zone } from "../../shared/reminders.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import { type ChannelState, createChannelState } from "./channel-state.ts";
import { createChannelWriter } from "./channel-writer.ts";
import { createTelegram } from "./telegram.ts";
import { createTelegramApi, type TelegramUpdate } from "./telegram-api.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const OWNER = 42;
const STRANGER = 666;
const TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

let now: number;
let store: Store;
let state: ChannelState;
let calls: { method: string; params: Record<string, unknown> }[];
let inbox: TelegramUpdate[][];
let slept: number[];
let lines: string[];
let busyOnce: boolean;
let settings: NotificationSettings;

beforeEach(() => {
  now = Date.parse("2026-10-15T16:00:00Z");
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  state = createChannelState(db);
  calls = [];
  inbox = [];
  slept = [];
  lines = [];
  busyOnce = false;
  settings = DEFAULT_NOTIFICATIONS;
});

const fakeFetch = (async (url: string, init: RequestInit) => {
  const method = url.split("/").pop() as string;
  const params = JSON.parse(String(init.body)) as Record<string, unknown>;
  calls.push({ method, params });
  if (busyOnce) {
    busyOnce = false;
    return Response.json({ ok: false, error_code: 429, parameters: { retry_after: 3 } });
  }
  if (method === "getUpdates") return Response.json({ ok: true, result: inbox.shift() ?? [] });
  if (method === "getMe") return Response.json({ ok: true, result: { username: "cave_bot" } });
  if (method === "sendMessage") return Response.json({ ok: true, result: { message_id: 7 } });
  return Response.json({ ok: true, result: true });
}) as unknown as typeof fetch;

function telegram() {
  const api = createTelegramApi({
    token: TOKEN,
    now: () => now,
    fetch: fakeFetch,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  return createTelegram({
    api,
    state,
    store,
    writer: createChannelWriter(store, "telegram", () => now),
    zone: () => MX,
    settings: () => settings,
    now: () => now,
    log: (l) => lines.push(l),
  });
}

let nextUpdate = 100;
const text = (chat: number, t: string): TelegramUpdate => ({
  update_id: nextUpdate++,
  message: { message_id: 1, chat: { id: chat }, text: t },
});
const button = (chat: number, data: string): TelegramUpdate => ({
  update_id: nextUpdate++,
  callback_query: { id: `q${nextUpdate}`, data, message: { message_id: 9, chat: { id: chat } } },
});
const sent = (method = "sendMessage") => calls.filter((c) => c.method === method);

async function link() {
  const t = telegram();
  const { code } = await t.startLink();
  inbox.push([text(OWNER, `/start ${code}`)]);
  await t.job.run({ now });
  return t;
}

function reminder(id: string, data: Record<string, unknown>) {
  const stamp = formatStamp(now, 0, "test");
  const doc: Doc = {
    id,
    kind: "item",
    collection: "reminders",
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "test",
  };
  store.applyChanges([doc], "test", now);
}

test("linking takes the one-time code from the owner's chat, then answers only that chat", async () => {
  const t = telegram();
  expect(t.channel.status()).toEqual({ ready: false, summary: "needs linking" });
  expect(await t.job.run({ now })).toMatchObject({ result: "skipped" });
  expect(calls).toEqual([]);

  const { code, bot } = await t.startLink();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  expect(bot).toBe("cave_bot");
  expect(JSON.stringify(state.get("telegram"))).not.toContain(code);
  inbox.push([text(STRANGER, `/start ${code}x`), text(OWNER, `/start ${code}`)]);
  await t.job.run({ now });
  expect(t.channel.status()).toEqual({ ready: true, summary: "linked" });
  expect(sent().map((c) => c.params.chat_id)).toEqual([OWNER]);

  inbox.push([text(STRANGER, "/due"), button(STRANGER, "done:x")]);
  calls = [];
  await t.job.run({ now });
  expect(calls.filter((c) => c.method !== "getUpdates")).toEqual([]);
  for (const line of lines) expect(line).not.toContain("/due");
});

test("a wrong or expired code links nothing", async () => {
  const t = telegram();
  const { code } = await t.startLink();
  inbox.push([text(OWNER, "/start WRONG1")]);
  await t.job.run({ now });
  expect(t.linked()).toBe(false);
  now += 11 * 60_000;
  // An expired link also stops polling.
  expect(await t.job.run({ now })).toMatchObject({ result: "skipped" });
  inbox.push([text(OWNER, `/start ${code}`)]);
  await t.startLink();
  await t.job.run({ now });
  expect(t.linked()).toBe(false);
});

test("Done and Snooze buttons apply the app's rules as stamped writes by channel:telegram", async () => {
  await link();
  reminder("rent", { _title: "Pay rent", due: "2026-10-15T09:00", repeat: "monthly" });
  reminder("call", { _title: "Call", due: "2026-10-15T09:30" });
  inbox.push([button(OWNER, "done:rent"), button(OWNER, "snooze60:call")]);
  const t = telegram();
  await t.job.run({ now });
  expect(store.get("rent")?.data).toMatchObject({ due: "2026-11-15T09:00" });
  expect(store.get("rent")?.data.done).not.toBe(true);
  expect(store.get("call")?.data.due).toBe("2026-10-15T11:00");
  expect(store.changesFor("rent", 1)[0]?.actor).toBe("channel:telegram");
  expect(sent("answerCallbackQuery").map((c) => c.params.text)).toEqual([
    "Done ✓",
    "Snoozed to 11:00",
  ]);
  expect(sent("editMessageText").map((c) => c.params.text)).toEqual(["Done ✓", "Snoozed to 11:00"]);
});

test("Approve is refused while approvals from Telegram are off", async () => {
  const t = await link();
  inbox.push([button(OWNER, "approve:flow1")]);
  await t.job.run({ now });
  expect(sent("answerCallbackQuery").at(-1)?.params.text).toContain(
    "Approving from Telegram is off",
  );
  settings = { ...DEFAULT_NOTIFICATIONS, telegramApprovals: true };
  inbox.push([button(OWNER, "approve:flow1")]);
  await t.job.run({ now });
  expect(sent("answerCallbackQuery").at(-1)?.params.text).not.toContain("is off");
});

test("/remind goes through the command bar's parser; anything unknown gets the help", async () => {
  const t = await link();
  inbox.push([
    text(OWNER, "/remind pay rent every month 22 9:00"),
    text(OWNER, "/remind call mom"),
    text(OWNER, "hello"),
  ]);
  await t.job.run({ now });
  const replies = sent().map((c) => c.params.text as string);
  expect(replies.slice(1)).toEqual([
    "Saved · Reminder · Pay rent · Thu Oct 22, 09:00 · monthly",
    expect.stringContaining("Add when"),
    expect.stringContaining("/remind <text> <when>"),
  ]);
  const created = store.itemsOf("reminders").find((d) => d.data._title === "Pay rent");
  expect(created?.data).toMatchObject({ due: "2026-10-22T09:00", repeat: "monthly", done: false });
  expect(created?.actor).toBe("channel:telegram");
});

test("the update cursor survives a restart, so nothing is handled twice", async () => {
  await link();
  inbox.push([text(OWNER, "/help"), text(OWNER, "/help")]);
  await telegram().job.run({ now });
  const offset = state.get<{ offset: number }>("telegram").offset;
  calls = [];
  await telegram().job.run({ now });
  expect(calls[0]).toMatchObject({ method: "getUpdates", params: { offset } });
});

test("a 429 waits retry_after and tries once more", async () => {
  const t = await link();
  busyOnce = true;
  await t.channel.send({
    kind: "test",
    title: "Test",
    url: "https://cave.example.dev/",
    actions: [],
  });
  expect(slept).toContain(3000);
  expect(sent().at(-1)?.params).toMatchObject({ chat_id: OWNER, text: "Test" });
});

test("a reminder goes out with Done, Snooze and Open; titles detail sends the title only", async () => {
  const t = await link();
  await t.channel.send({
    kind: "reminder",
    itemId: "rent",
    title: "Pay rent",
    url: "https://cave.example.dev/r/rent",
    actions: [],
  });
  expect(sent().at(-1)?.params).toEqual({
    chat_id: OWNER,
    text: "Pay rent",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Done", callback_data: "done:rent" },
          { text: "Snooze 1h", callback_data: "snooze60:rent" },
        ],
        [{ text: "Open", url: "https://cave.example.dev/r/rent" }],
      ],
    },
  });
  for (const call of calls) expect(JSON.stringify(call)).not.toContain(TOKEN);
});
