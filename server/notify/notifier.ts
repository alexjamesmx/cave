import type { Database } from "bun:sqlite";
import type { ChannelId, Detail, NotificationSettings } from "../../shared/notifications.ts";
import type {
  ChannelStatus,
  Message,
  Notification,
  NotificationChannel,
  SendResult,
} from "./types.ts";

/**
 * A notification for one channel. `titles` keeps it to the title and a link to the Cave: no
 * due time, no field values, nothing a third party should read. `full` adds the details.
 */
export function render(n: Notification, detail: Detail, origin: string): Message {
  const url = (path: string) => new URL(path, origin).href;
  return {
    kind: n.kind,
    ...(n.itemId ? { itemId: n.itemId } : {}),
    title: n.title,
    ...(detail === "full" && n.details.length > 0 ? { body: n.details.join(" · ") } : {}),
    url: url(n.path),
    ...(n.tag ? { tag: n.tag } : {}),
    actions: (n.actions ?? []).map((a) => ({ id: a.id, label: a.label, url: url(a.path) })),
  };
}

export interface NotifierOptions {
  channels: NotificationChannel[];
  settings: () => NotificationSettings;
  db: Database;
  now: () => number;
  /** The app's https origin, for links in messages. */
  origin: string;
  log?: (line: string) => void;
}

export interface Notifier {
  /** Every registered channel and what it needs, for Settings → Integrations. */
  statuses(): { id: ChannelId; label: string; status: ChannelStatus }[];
  /** Sends to `only`, or to the default channels; one `notification_log` row per channel. */
  notify(n: Notification, only?: ChannelId[], target?: string): Promise<SendResult>;
}

export function createNotifier({
  channels,
  settings,
  db,
  now,
  origin,
  log = console.log,
}: NotifierOptions): Notifier {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const record = db.query<void, [string, string, number, string]>(
    "INSERT INTO notification_log (key, channel, sent_at, result) VALUES (?, ?, ?, ?)",
  );
  return {
    statuses: () => channels.map((c) => ({ id: c.id, label: c.label, status: c.status() })),
    async notify(n, only, target) {
      const config = settings();
      const total: SendResult = { delivered: 0, failed: 0 };
      for (const id of only ?? config.channels) {
        const channel = byId.get(id);
        if (!channel) continue;
        const status = channel.status();
        let result: string;
        if (!status.ready) {
          result = `skipped: ${status.summary}`;
        } else {
          try {
            const sent = await channel.send(render(n, config.detail[id], origin), target);
            total.delivered += sent.delivered;
            total.failed += sent.failed;
            result = sent.failed === 0 ? "ok" : sent.delivered > 0 ? "partial" : "failed";
          } catch (error) {
            total.failed += 1;
            result = `failed: ${(error as Error).name}`;
          }
        }
        record.run(n.key, id, now(), result);
        // The key names the item by id; titles and bodies never reach a log.
        log(`notify ${id} ${n.key} ${result}`);
      }
      return total;
    },
  };
}

/** The "already sent" check across channels, and the missed count Settings shows. */
export function createSentLog(db: Database) {
  const has = db.query<{ key: string }, [string]>(
    "SELECT key FROM notifications_sent WHERE key = ?",
  );
  const put = db.query<void, [string, string | null, number, number, number]>(
    "INSERT OR IGNORE INTO notifications_sent (key, item_id, sent_at, delivered, failed) VALUES (?, ?, ?, ?, ?)",
  );
  const missedLog = db.query<void, [string, number]>(
    "INSERT INTO notification_log (key, channel, sent_at, result) VALUES (?, 'none', ?, 'missed')",
  );
  const missed = db.query<{ n: number }, []>(
    "SELECT count(*) AS n FROM notification_log WHERE result = 'missed'",
  );
  return {
    wasSent: (key: string) => has.get(key) !== null,
    markSent(key: string, itemId: string | null, at: number, result: SendResult) {
      put.run(key, itemId, at, result.delivered, result.failed);
    },
    /** Too old to send after downtime: recorded so it never sends, and counted. */
    markMissed(key: string, itemId: string | null, at: number) {
      put.run(key, itemId, at, 0, 0);
      missedLog.run(key, at);
    },
    missedCount: () => missed.get()?.n ?? 0,
  };
}
export type SentLog = ReturnType<typeof createSentLog>;
