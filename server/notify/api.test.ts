import { afterAll, beforeAll, expect, test } from "bun:test";
import webpush from "web-push";
import { seedDocs } from "../../shared/seed.ts";
import { serveCave } from "../app.ts";
import { openDb } from "../db.ts";
import { createStore } from "../store.ts";
import { createNotificationSystem } from "./system.ts";

const OWNER = "owner-secret";
const vapid = { subject: "mailto:o@example.com", ...webpush.generateVAPIDKeys() };
const TELEGRAM = `123456789:${"T".repeat(35)}`;
const DISCORD = "https://discord.com/api/webhooks/1/discord-secret";
const ENDPOINT = "https://push.example.test/send/very-secret-endpoint";
let server: ReturnType<typeof serveCave>;
const pushed: string[] = [];

beforeAll(async () => {
  const db = openDb(":memory:");
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  const system = createNotificationSystem({
    db,
    store,
    now: Date.now,
    origin: "https://cave.example.dev",
    push: vapid,
    telegramToken: TELEGRAM,
    discordWebhook: DISCORD,
    env: "production",
    fetch: (async (url: string) => {
      pushed.push(url);
      return url.includes("api.telegram.org")
        ? Response.json({ ok: true, result: { username: "cave_bot" } })
        : new Response(null, { status: 201 });
    }) as unknown as typeof fetch,
    log: () => {},
  });
  server = serveCave({
    hostname: "127.0.0.1",
    port: 0,
    store,
    token: OWNER,
    now: Date.now,
    notifications: system.routes,
  });
});
afterAll(() => server.stop(true));

const call = (path: string, init: RequestInit = {}, token: string | null = OWNER) =>
  fetch(new URL(path, server.url), {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
const post = (path: string, body: unknown) =>
  call(path, { method: "POST", body: JSON.stringify(body) });

// A real P-256 point: Web Push encrypts to it.
const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
  "deriveBits",
]);
const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", ua.publicKey)).toString(
  "base64url",
);
const auth = Buffer.alloc(16, 3).toString("base64url");

test("every notification route needs the owner token", async () => {
  for (const path of ["/api/push", "/api/notifications"]) {
    expect((await call(path, {}, null)).status).toBe(401);
  }
  expect((await call("/api/telegram/link", { method: "POST", body: "{}" }, null)).status).toBe(401);
});

test("a device subscribes, is listed by label only, and Send test reaches it", async () => {
  const res = await post("/api/push/subscribe", {
    subscription: { endpoint: ENDPOINT, keys: { p256dh, auth } },
    deviceId: "phone-1",
    label: "iPhone · Safari",
  });
  expect(res.status).toBe(200);
  const listed = (await (await call("/api/push?deviceId=phone-1")).json()) as Record<
    string,
    unknown
  >;
  expect(listed).toMatchObject({
    enabled: true,
    publicKey: vapid.publicKey,
    devices: [{ label: "iPhone · Safari", this: true, last_ok_at: null }],
  });
  expect(await (await post("/api/push/test", { deviceId: "phone-1" })).json()).toEqual({
    delivered: 1,
    failed: 0,
  });
  expect(pushed).toContain(ENDPOINT);
});

test("no answer ever carries an endpoint, a private key, a token, a webhook or a chat id", async () => {
  const link = await (await post("/api/telegram/link", {})).json();
  expect(link).toMatchObject({ code: expect.stringMatching(/^[A-Z2-9]{6}$/), bot: "cave_bot" });
  const answers = [
    await (await call("/api/push?deviceId=phone-1")).text(),
    await (await call("/api/notifications")).text(),
    JSON.stringify(link),
  ].join("\n");
  for (const secret of [
    ENDPOINT,
    "very-secret-endpoint",
    vapid.privateKey,
    TELEGRAM,
    DISCORD,
    "discord-secret",
    OWNER,
  ]) {
    expect(answers).not.toContain(secret);
  }
  const notifications = JSON.parse(answers.split("\n")[1] as string);
  expect(
    notifications.channels.map((c: { id: string; status: { summary: string } }) => [
      c.id,
      c.status.summary,
    ]),
  ).toEqual([
    ["webpush", "1 device"],
    ["telegram", "needs linking"],
    ["discord", "ready"],
  ]);
});

test("bad subscriptions and bodies over 4 KB are refused", async () => {
  for (const body of [
    {
      subscription: { endpoint: "http://push.example.test/x", keys: { p256dh, auth } },
      deviceId: "d",
    },
    { subscription: { endpoint: "http://127.0.0.1:9/x", keys: { p256dh, auth } }, deviceId: "d" },
    { subscription: { endpoint: ENDPOINT, keys: { p256dh, auth: "short" } }, deviceId: "d" },
    { subscription: { endpoint: ENDPOINT, keys: { p256dh, auth } }, deviceId: "../../etc" },
    {
      subscription: { endpoint: ENDPOINT, keys: { p256dh, auth } },
      deviceId: "d",
      label: "x".repeat(5000),
    },
  ]) {
    expect((await post("/api/push/subscribe", body)).status).toBe(400);
  }
});

test("unsubscribing removes the device", async () => {
  expect(await (await post("/api/push/unsubscribe", { endpoint: ENDPOINT })).json()).toEqual({
    ok: true,
    removed: true,
  });
  const listed = (await (await call("/api/push")).json()) as { devices: unknown[] };
  expect(listed.devices).toEqual([]);
});
