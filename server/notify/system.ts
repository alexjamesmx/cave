import type { Database } from "bun:sqlite";
import { notificationSettings } from "../../shared/notifications.ts";
import { zoneOf } from "../../shared/reminders.ts";
import type { VapidKeys } from "../config.ts";
import { type CaveEnv, delivers } from "../env.ts";
import { approvalRef, createApprovals } from "../flows/approvals.ts";
import { createFlowEngine } from "../flows/engine.ts";
import type { Job } from "../jobs/scheduler.ts";
import type { Store } from "../store.ts";
import { notificationRoutes } from "./api.ts";
import { createChannelState } from "./channel-state.ts";
import { createChannelWriter } from "./channel-writer.ts";
import { createDiscordChannel } from "./discord.ts";
import { createNotifier, createSentLog } from "./notifier.ts";
import { createPaymentSweep } from "./payment-sweep.ts";
import { createReminderSweep } from "./reminder-sweep.ts";
import { type Approvals, createTelegram } from "./telegram.ts";
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
  /** Only `production` lets anything leave the Cave. */
  env: CaveEnv;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/**
 * The notifier and its three channels, the reminder sweep, Telegram's poll, the flow engine
 * and approvals, and the routes. Reminders and flows call the notifier; nothing else talks to
 * a channel.
 */
export function createNotificationSystem(o: NotificationSystemOptions) {
  const log = o.log ?? console.log;
  const deliver = delivers(o.env);
  // Outside production the notifier never calls a channel and Telegram gets no API. Any other
  // way a channel might reach the network fails here instead of delivering.
  const fetchFn: typeof fetch = deliver
    ? (o.fetch ?? fetch)
    : Object.assign(
        async () => {
          throw new Error(`CAVE_ENV=${o.env}: nothing leaves the Cave`);
        },
        { preconnect: () => {} },
      );
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
  const telegramWriter = createChannelWriter(o.store, "telegram", o.now);
  // Telegram asks for approvals before the notifier exists; it only calls them on a tap.
  let approvals: Approvals | undefined;
  const telegram = createTelegram({
    api:
      o.telegramToken && deliver
        ? createTelegramApi({ token: o.telegramToken, now: o.now, fetch: fetchFn })
        : undefined,
    state,
    store: o.store,
    writer: telegramWriter,
    approvals: {
      ref: approvalRef,
      decide: (ref, approve) => approvals?.decide(ref, approve) ?? "Not ready yet.",
    },
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
    deliver,
    log,
  });
  approvals = createApprovals({ store: o.store, notifier, writer: telegramWriter, log });
  const sweep = createReminderSweep({ store: o.store, notifier, sent, zone });
  const payments = createPaymentSweep({ store: o.store, notifier, sent, zone });
  const flows = createFlowEngine({ store: o.store, db: o.db, notifier, now: o.now, zone, log });
  const jobs: Job[] = [sweep, payments, flows.job, telegram.job];
  const routes = notificationRoutes({
    notifier,
    sent,
    subscriptions,
    publicKey: o.push?.publicKey,
    telegram,
    now: o.now,
    // A loopback http: endpoint (the e2e test's own) only where nothing is ever delivered.
    allowLoopbackHttp: !deliver,
  });
  return { notifier, sent, routes, jobs, telegram, flows };
}
