import type { Database } from "bun:sqlite";
import webpush from "web-push";
import type { VapidKeys } from "../config.ts";
import type { ChannelStatus, Message, NotificationChannel, SendResult } from "./types.ts";

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  device_id: string;
  label: string;
  created_at: number;
  last_ok_at: number | null;
  last_error: string | null;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const b64uBytes = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value)
    ? Buffer.from(value, "base64url")
    : undefined;

/**
 * A browser's `PushSubscription` as JSON. The endpoint must be `https:`; a non-production
 * server also takes loopback `http:`, which is how the e2e test serves its own push endpoint.
 */
export function validateSubscription(
  value: unknown,
  { allowLoopbackHttp }: { allowLoopbackHttp: boolean },
):
  | { ok: true; value: { endpoint: string; p256dh: string; auth: string } }
  | { ok: false; error: string } {
  const sub = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = sub?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2048 || !URL.canParse(endpoint))
    return { ok: false, error: "subscription.endpoint must be a URL" };
  const url = new URL(endpoint);
  const loopback = url.protocol === "http:" && LOOPBACK.has(url.hostname) && allowLoopbackHttp;
  if (url.protocol !== "https:" && !loopback)
    return { ok: false, error: "subscription.endpoint must be https" };
  const p256dh = b64uBytes(sub?.keys?.p256dh);
  if (p256dh?.length !== 65 || p256dh[0] !== 4)
    return { ok: false, error: "subscription.keys.p256dh must be a base64url P-256 public key" };
  const auth = b64uBytes(sub?.keys?.auth);
  if (auth?.length !== 16)
    return { ok: false, error: "subscription.keys.auth must be 16 base64url bytes" };
  return {
    ok: true,
    value: { endpoint, p256dh: sub?.keys?.p256dh as string, auth: sub?.keys?.auth as string },
  };
}

export function createSubscriptions(db: Database) {
  const all = db.query<StoredSubscription, []>(
    "SELECT * FROM push_subscriptions ORDER BY created_at",
  );
  return {
    upsert(
      sub: { endpoint: string; p256dh: string; auth: string },
      deviceId: string,
      label: string,
      at: number,
    ) {
      db.run(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, device_id, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
           device_id = excluded.device_id, label = excluded.label, last_error = NULL`,
        [sub.endpoint, sub.p256dh, sub.auth, deviceId, label, at],
      );
    },
    remove: (endpoint: string) =>
      db.run("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]).changes > 0,
    list: () => all.all(),
    markOk: (endpoint: string, at: number) =>
      db.run("UPDATE push_subscriptions SET last_ok_at = ?, last_error = NULL WHERE endpoint = ?", [
        at,
        endpoint,
      ]),
    markError: (endpoint: string, error: string) =>
      db.run("UPDATE push_subscriptions SET last_error = ? WHERE endpoint = ?", [error, endpoint]),
  };
}
export type Subscriptions = ReturnType<typeof createSubscriptions>;

/**
 * Declarative Web Push (Safari 18.4+ shows it without running the service worker); other
 * browsers hand the same JSON to the service worker's `push` event, which shows it.
 */
export function payload(message: Message): string {
  return JSON.stringify({
    web_push: 8030,
    notification: {
      title: message.title,
      ...(message.body ? { body: message.body } : {}),
      navigate: message.url,
      ...(message.tag ? { tag: message.tag } : {}),
      lang: "en",
      dir: "ltr",
      silent: false,
      ...(message.actions.length > 0
        ? {
            actions: message.actions.map((a) => ({
              action: a.id,
              title: a.label,
              navigate: a.url,
            })),
          }
        : {}),
    },
  });
}

/** A push message waits this long for an offline phone; a reminder older than that is stale. */
const TTL_SECONDS = 6 * 60 * 60;
const MAX_RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10_000;

/** `Retry-After` in seconds or as an HTTP date, capped at 5 minutes. */
export function retryAfterMs(header: string | null, now: number): number {
  if (!header) return 0;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Math.min(Math.max(Number.isFinite(ms) ? ms : 0, 0), MAX_RETRY_MS);
}

export interface WebPushOptions {
  keys: VapidKeys | undefined;
  subscriptions: Subscriptions;
  now: () => number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export function createWebPushChannel({
  keys,
  subscriptions,
  now,
  fetch: send = fetch,
  sleep = (ms) => Bun.sleep(ms),
  log = console.log,
}: WebPushOptions): NotificationChannel {
  // One device; the endpoint and the payload stay out of the log.
  async function deliver(
    sub: StoredSubscription,
    body: string,
    vapid: VapidKeys,
  ): Promise<boolean> {
    const request = webpush.generateRequestDetails(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { vapidDetails: vapid, TTL: TTL_SECONDS, contentEncoding: "aes128gcm", urgency: "high" },
    );
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(([k]) => k.toLowerCase() !== "content-length"),
    ) as Record<string, string>;
    for (let attempt = 0; attempt < 2; attempt++) {
      let status: number;
      let retryAfter: string | null = null;
      try {
        const res = await send(sub.endpoint, {
          method: "POST",
          headers,
          body: request.body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        status = res.status;
        retryAfter = res.headers.get("retry-after");
      } catch (error) {
        subscriptions.markError(sub.endpoint, (error as Error).name);
        log(`push ${sub.label}: ${(error as Error).name}`);
        return false;
      }
      if (status >= 200 && status < 300) {
        subscriptions.markOk(sub.endpoint, now());
        log(`push ${sub.label}: ${status}`);
        return true;
      }
      if (status === 404 || status === 410) {
        subscriptions.remove(sub.endpoint);
        log(`push ${sub.label}: ${status}, subscription removed`);
        return false;
      }
      if ((status === 429 || status >= 500) && attempt === 0) {
        await sleep(retryAfterMs(retryAfter, now()));
        continue;
      }
      subscriptions.markError(sub.endpoint, `HTTP ${status}`);
      log(`push ${sub.label}: ${status}`);
      return false;
    }
    return false;
  }

  return {
    id: "webpush",
    label: "Web Push",
    status(): ChannelStatus {
      if (!keys) return { ready: false, summary: "needs keys" };
      const devices = subscriptions.list().length;
      if (devices === 0) return { ready: false, summary: "no devices yet" };
      return { ready: true, summary: devices === 1 ? "1 device" : `${devices} devices` };
    },
    async send(message, deviceId): Promise<SendResult> {
      if (!keys) return { delivered: 0, failed: 0 };
      const body = payload(message);
      const result: SendResult = { delivered: 0, failed: 0 };
      for (const sub of subscriptions.list()) {
        if (deviceId !== undefined && sub.device_id !== deviceId) continue;
        if (await deliver(sub, body, keys)) result.delivered += 1;
        else result.failed += 1;
      }
      return result;
    },
  };
}
