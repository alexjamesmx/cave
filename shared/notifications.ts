/** Channels a notification can go through; each is a `NotificationChannel` on the server. */
export const CHANNELS = ["webpush", "telegram", "discord", "email"] as const;
export type ChannelId = (typeof CHANNELS)[number];

/**
 * How much a channel is told. `titles`: the item's title and an "Open in the Cave" link, no
 * amounts, bodies or field values. `full`: also the due time and what the notification shows.
 */
export type Detail = "full" | "titles";

export interface NotificationSettings {
  /** Where a notification goes when nothing names its channels. */
  channels: ChannelId[];
  detail: Record<ChannelId, Detail>;
  /** Telegram's Approve button for flows; off, since a hijacked account could then approve. */
  telegramApprovals: boolean;
  /** `HH:MM` in the owner's zone for the daily digest email (M12 part 3); unset means none. */
  digest?: string;
}

/**
 * Web Push is the private default. Telegram and Discord can read what they carry, so they get
 * titles only unless the owner says otherwise; email goes to the owner's own inbox, so it gets
 * full detail.
 */
export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  channels: ["webpush"],
  detail: { webpush: "full", telegram: "titles", discord: "titles", email: "full" },
  telegramApprovals: false,
};

const isChannel = (value: unknown): value is ChannelId => CHANNELS.includes(value as ChannelId);

/** `settings.notifications` as synced; settings docs aren't shape-checked, so stay defensive. */
export function notificationSettings(
  settings: Record<string, unknown> | undefined,
): NotificationSettings {
  const raw = settings?.notifications as Partial<Record<string, unknown>> | undefined;
  const channels = Array.isArray(raw?.channels)
    ? [...new Set(raw.channels.filter(isChannel))]
    : DEFAULT_NOTIFICATIONS.channels;
  const rawDetail = (raw?.detail ?? {}) as Record<string, unknown>;
  const detail = Object.fromEntries(
    CHANNELS.map((c) => [
      c,
      rawDetail[c] === "full" || rawDetail[c] === "titles"
        ? rawDetail[c]
        : DEFAULT_NOTIFICATIONS.detail[c],
    ]),
  ) as Record<ChannelId, Detail>;
  const digest = raw?.digest;
  return {
    channels,
    detail,
    telegramApprovals: raw?.telegramApprovals === true,
    ...(typeof digest === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(digest) ? { digest } : {}),
  };
}
