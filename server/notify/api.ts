import { CHANNELS, type ChannelId } from "../../shared/notifications.ts";
import type { Notifier, SentLog } from "./notifier.ts";
import type { Telegram } from "./telegram.ts";
import type { Notification } from "./types.ts";
import { type Subscriptions, validateSubscription } from "./webpush.ts";

const MAX_SUBSCRIBE_BYTES = 4 * 1024;

export interface NotificationApiDeps {
  notifier: Notifier;
  sent: SentLog;
  subscriptions: Subscriptions;
  /** The VAPID public key; undefined while push is off. */
  publicKey: string | undefined;
  telegram: Telegram;
  now: () => number;
  /** Loopback `http:` endpoints, for the e2e test's push service; never in production. */
  allowLoopbackHttp: boolean;
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

async function readJson(req: Request, limit: number): Promise<unknown> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > limit) throw new Error("too large");
  return JSON.parse(text);
}

function testNotification(now: number): Notification {
  return {
    key: `test:${now}`,
    kind: "test",
    title: "Test from the Cave",
    details: ["Notifications work on this channel."],
    path: "/settings",
  };
}

/**
 * Notification routes, all behind the owner rule. Endpoints, keys, tokens and chat ids never
 * leave the server: devices are listed by label, and a device knows its own endpoint.
 */
export function notificationRoutes(deps: NotificationApiDeps) {
  const { notifier, sent, subscriptions, publicKey, telegram, now } = deps;
  return {
    /** `GET /api/push?deviceId=`: whether push is on, its public key, and the devices. */
    push(req: Request): Response {
      const deviceId = new URL(req.url).searchParams.get("deviceId");
      return Response.json({
        enabled: publicKey !== undefined,
        publicKey: publicKey ?? null,
        devices: subscriptions.list().map((s) => ({
          label: s.label,
          created_at: s.created_at,
          last_ok_at: s.last_ok_at,
          this: deviceId !== null && s.device_id === deviceId,
        })),
      });
    },
    /** `POST /api/push/subscribe`: `{ subscription, deviceId, label }`, under 4 KB; upserts. */
    async subscribe(req: Request): Promise<Response> {
      if (!publicKey) return bad("push is off on this server", 409);
      let body: { subscription?: unknown; deviceId?: unknown; label?: unknown };
      try {
        body = (await readJson(req, MAX_SUBSCRIBE_BYTES)) as typeof body;
      } catch {
        return bad("body must be JSON under 4 KB");
      }
      const sub = validateSubscription(body?.subscription, {
        allowLoopbackHttp: deps.allowLoopbackHttp,
      });
      if (!sub.ok) return bad(sub.error);
      if (typeof body.deviceId !== "string" || !/^[\w-]{1,64}$/.test(body.deviceId))
        return bad("deviceId must be this device's id");
      const label = typeof body.label === "string" ? body.label.slice(0, 80) : "This device";
      subscriptions.upsert(sub.value, body.deviceId, label, now());
      return Response.json({ ok: true });
    },
    /** `POST /api/push/unsubscribe`: `{ endpoint }`, the device's own. */
    async unsubscribe(req: Request): Promise<Response> {
      let body: { endpoint?: unknown };
      try {
        body = (await readJson(req, MAX_SUBSCRIBE_BYTES)) as typeof body;
      } catch {
        return bad("body must be JSON under 4 KB");
      }
      if (typeof body?.endpoint !== "string") return bad("endpoint is required");
      return Response.json({ ok: true, removed: subscriptions.remove(body.endpoint) });
    },
    /** `POST /api/push/test`: `{ deviceId? }`, this device or every device. */
    async pushTest(req: Request): Promise<Response> {
      const body = (await req.json().catch(() => ({}))) as { deviceId?: unknown };
      const deviceId = typeof body.deviceId === "string" ? body.deviceId : undefined;
      return Response.json(await notifier.notify(testNotification(now()), ["webpush"], deviceId));
    },
    /** `GET /api/notifications`: each channel and what it needs, and the missed count. */
    notifications(): Response {
      return Response.json({
        channels: notifier.statuses(),
        missed: sent.missedCount(),
        telegram: { linked: telegram.linked() },
      });
    },
    /** `POST /api/notifications/test`: `{ channel }`. */
    async channelTest(req: Request): Promise<Response> {
      const body = (await req.json().catch(() => ({}))) as { channel?: unknown };
      if (!CHANNELS.includes(body.channel as ChannelId)) return bad("unknown channel");
      return Response.json(
        await notifier.notify(testNotification(now()), [body.channel as ChannelId]),
      );
    },
    async telegramLink(): Promise<Response> {
      if (telegram.channel.status().summary === "needs a bot token")
        return bad("the server has no Telegram bot token", 409);
      return Response.json(await telegram.startLink());
    },
    telegramUnlink(): Response {
      telegram.unlink();
      return Response.json({ ok: true });
    },
  };
}
export type NotificationRoutes = ReturnType<typeof notificationRoutes>;
