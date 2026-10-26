import type { ChannelId } from "../../shared/notifications.ts";

/** What happened, channel-neutral. The notifier renders it per channel and detail level. */
export interface Notification {
  /** Names the send for "already sent" and the log, e.g. `reminder:<id>:<due>`; never a title. */
  key: string;
  /** `payment`: one coming due (M7c); `flow`: a flow waiting for approval; `message`: what a flow's notify step sends. `budget`: a share of the monthly limit crossed (M12). */
  kind: "reminder" | "payment" | "test" | "flow" | "message" | "budget" | "digest";
  itemId?: string;
  title: string;
  /** Shown only at `full` detail: the due time, "Repeats monthly", the fields shown. */
  details: string[];
  /** The app path it opens, e.g. `/r/<id>`. */
  path: string;
  /** Replaces an earlier notification with the same tag, e.g. `reminder:<id>`. */
  tag?: string;
  actions?: NotificationAction[];
  /** An email's own recipients and sender name (a flow's Send an email); else the defaults. */
  email?: EmailParts;
}

export interface EmailParts {
  to?: string[];
  fromName?: string;
  /** Its text is the message alone: no links into the Cave, for someone else's inbox. */
  plain?: boolean;
}

interface NotificationAction {
  id: "done" | "snooze60" | "approve" | "reject";
  label: string;
  path: string;
}

/** A notification as one channel sends it: absolute links, and a body only at `full`. */
export interface Message {
  /** The notification's key, for a channel's own idempotency. */
  key: string;
  kind: Notification["kind"];
  itemId?: string;
  title: string;
  body?: string;
  /** The details one per line at `full`, for channels that keep lines (email); empty at `titles`. */
  lines: string[];
  url: string;
  tag?: string;
  actions: { id: NotificationAction["id"]; label: string; url: string }[];
  email?: EmailParts;
}

export interface SendResult {
  delivered: number;
  failed: number;
}

/** What a channel needs before it can send; reported instead of failing silently. */
export interface ChannelStatus {
  ready: boolean;
  /** "3 devices", "needs a bot token", "webhook gone". */
  summary: string;
}

/**
 * One way a notification reaches the owner. Web Push, Telegram and Discord now; ntfy or
 * email later are one more of these, registered in `main.ts`.
 */
export interface NotificationChannel {
  id: ChannelId;
  label: string;
  status(): ChannelStatus;
  /** `target` narrows the send, e.g. one device for Web Push's "Send test". */
  send(message: Message, target?: string): Promise<SendResult>;
}
