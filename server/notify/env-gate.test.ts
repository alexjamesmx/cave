import { expect, test } from "bun:test";
import webpush from "web-push";
import { localDateTime } from "../../shared/dates.ts";
import type { FlowDefinition } from "../../shared/flows/registry.ts";
import { formatStamp } from "../../shared/hlc.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { openDb } from "../db.ts";
import { CAVE_ENVS, type CaveEnv } from "../env.ts";
import { createStore } from "../store.ts";
import { createChannelState } from "./channel-state.ts";
import { createNotificationSystem } from "./system.ts";
import { createSubscriptions } from "./webpush.ts";

const NOW = Date.parse("2026-10-16T18:00:00Z");
const vapid = { subject: "mailto:o@example.com", ...webpush.generateVAPIDKeys() };
const TELEGRAM = `123456789:${"T".repeat(35)}`;
const DISCORD = "https://discord.com/api/webhooks/1/discord-secret";
const ENDPOINT = "https://push.example.test/send/endpoint";

const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
  "deriveBits",
]);
const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", ua.publicKey)).toString(
  "base64url",
);

const NOTIFY_ON_TASK: FlowDefinition = {
  version: 1,
  trigger: { type: "item-added", collection: "tasks" },
  steps: [{ type: "notify", title: "New task", open: "trigger-item" }],
};

/** All three channels configured and ready, as on the VPS, under `env`. */
function setup(env: CaveEnv) {
  const db = openDb(":memory:");
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  createSubscriptions(db).upsert(
    { endpoint: ENDPOINT, p256dh, auth: Buffer.alloc(16, 3).toString("base64url") },
    "phone",
    "Phone",
    NOW,
  );
  createChannelState(db).set("telegram", { chatId: 42 }, NOW);
  const requests: string[] = [];
  const system = createNotificationSystem({
    db,
    store,
    now: () => NOW,
    origin: "https://cave.example.dev",
    push: vapid,
    telegramToken: TELEGRAM,
    discordWebhook: DISCORD,
    env,
    fetch: (async (url: string) => {
      requests.push(new URL(url).host);
      if (url.includes("/getUpdates")) return Response.json({ ok: true, result: [] });
      return url.includes("api.telegram.org")
        ? Response.json({ ok: true, result: { message_id: 1, username: "cave_bot" } })
        : new Response(null, { status: 201 });
    }) as unknown as typeof fetch,
    log: () => {},
  });
  // Every channel is a default channel, so a reminder goes to all three.
  store.applyChanges(
    [
      {
        id: "settings",
        kind: "setting",
        collection: null,
        data: { notifications: { channels: ["webpush", "telegram", "discord"] } },
        stamps: { notifications: formatStamp(NOW, 0, "test") },
        actor: "owner",
      },
    ],
    "owner",
    NOW,
  );
  const results = () =>
    db
      .query<{ channel: string; result: string }, []>(
        "SELECT channel, result FROM notification_log WHERE channel != 'none' ORDER BY seq",
      )
      .all();
  let tick = 1;
  const write = (id: string, collection: string, data: Record<string, unknown>) => {
    const stamp = formatStamp(NOW, tick++, "test");
    const doc: Doc = {
      id,
      kind: "item",
      collection,
      data,
      stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
      actor: "owner",
    };
    store.applyChanges([doc], "owner", NOW);
  };
  const job = (id: string) => {
    const found = system.jobs.find((j) => j.id === id);
    if (!found) throw new Error(`no job ${id}`);
    return found.run({ now: NOW });
  };
  return { system, requests, results, write, job };
}

const OUT = ["push.example.test", "api.telegram.org", "discord.com"];

for (const env of CAVE_ENVS) {
  const delivers = env === "production";

  test(`${env}: a due reminder ${delivers ? "reaches all three channels" : "goes to the outbox, and nothing leaves"}`, async () => {
    const s = setup(env);
    s.write("r1", "reminders", {
      _title: "Pay rent",
      due: localDateTime(new Date(NOW - 60_000), "America/Mexico_City"),
      repeat: "none",
    });
    await s.job("reminders");
    const results = s.results();
    expect(results.map((r) => r.channel).sort()).toEqual(["discord", "telegram", "webpush"]);
    expect(new Set(results.map((r) => r.result))).toEqual(new Set([delivers ? "ok" : "outbox"]));
    expect([...new Set(s.requests)].sort()).toEqual(delivers ? [...OUT].sort() : []);
  });

  test(`${env}: a flow's notify step ${delivers ? "delivers" : "goes to the outbox"}`, async () => {
    const s = setup(env);
    s.write("f1", "flows", { _title: "Ping", status: "on", definition: NOTIFY_ON_TASK });
    s.write("t1", "tasks", { _title: "Ship it" });
    await s.system.flows.settled();
    expect(new Set(s.results().map((r) => r.result))).toEqual(
      new Set([delivers ? "ok" : "outbox"]),
    );
    expect(s.requests.length > 0).toBe(delivers);
  });

  test(`${env}: Telegram ${delivers ? "polls and links" : "never polls or calls the Bot API"}`, async () => {
    const s = setup(env);
    await s.job("telegram");
    const link = await s.system.telegram.startLink();
    expect(link.bot).toBe(delivers ? "cave_bot" : undefined);
    expect(s.requests.includes("api.telegram.org")).toBe(delivers);
    if (!delivers) expect(s.requests).toEqual([]);
  });

  test(`${env}: Settings' channel status ${delivers ? "is as configured" : "says outbox only"}`, () => {
    const s = setup(env);
    for (const { status } of s.system.notifier.statuses())
      expect(status.summary.startsWith("outbox only")).toBe(!delivers);
  });
}
