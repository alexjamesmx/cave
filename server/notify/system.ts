import type { Database } from "bun:sqlite";
import { notificationSettings } from "../../shared/notifications.ts";
import { zoneOf } from "../../shared/reminders.ts";
import type { VapidKeys } from "../config.ts";
import type { Job } from "../jobs/scheduler.ts";
import type { Store } from "../store.ts";
import { notificationRoutes } from "./api.ts";
import { createChannelState } from "./channel-state.ts";
import { createChannelWriter } from "./channel-writer.ts";
import { createDiscordChannel } from "./discord.ts";
import { createNotifier, createSentLog } from "./notifier.ts";
import { createReminderSweep } from "./reminder-sweep.ts";
import { createTelegram } from "./telegram.ts";
import { createTelegramApi } from "./telegram-api.ts";
import { createSubscriptions, createWebPushChannel } from "./webpush.ts";

export interface NotificationSystemOptions {
  db: Database;
  store: Store;
  now: () => number;
  /** The app's origin for links: the public https origin behind Caddy. */
  origin: string;
  push: VapidKeys | undefined;
  telegramToken: string | undefined;
  discordWebhook: string | undefined;
  production: boolean;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/**
 * The notifier and its three channels, the reminder sweep, Telegram's poll and the routes.
 * Reminders and flows call the notifier; nothing else talks to a channel.
 */
export function createNotificationSystem(o: NotificationSystemOptions) {
  const log = o.log ?? console.log;
  const fetchFn = o.fetch ?? fetch;
  const settingsDoc = () => o.store.get("settings")?.data;
  const settings = () => notificationSettings(settingsDoc());
  const zone = () => zoneOf(settingsDoc(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const state = createChannelState(o.db);
  const subscriptions = createSubscriptions(o.db);
  const sent = createSentLog(o.db);

  const webpush = createWebPushChannel({
    keys: o.push,
    subscriptions,
    now: o.now,
    fetch: fetchFn,
    log,
  });
  const discord = createDiscordChannel({
    webhook: o.discordWebhook,
    state,
    now: o.now,
    fetch: fetchFn,
    log,
  });
  const telegram = createTelegram({
    api: o.telegramToken
      ? createTelegramApi({ token: o.telegramToken, now: o.now, fetch: fetchFn })
      : undefined,
    state,
    store: o.store,
    writer: createChannelWriter(o.store, "telegram", o.now),
    zone,
    settings,
    now: o.now,
    log,
  });
  const notifier = createNotifier({
    channels: [webpush, telegram.channel, discord],
    settings,
    db: o.db,
    now: o.now,
    origin: o.origin,
    log,
  });
  const sweep = createReminderSweep({ store: o.store, notifier, sent, zone });
  const jobs: Job[] = [sweep, telegram.job];
  const routes = notificationRoutes({
    notifier,
    sent,
    subscriptions,
    publicKey: o.push?.publicKey,
    telegram,
    now: o.now,
    allowLoopbackHttp: !o.production,
  });
  return { notifier, sent, routes, jobs, telegram };
}
