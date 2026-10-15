import type { Database } from "bun:sqlite";

/**
 * Small server-only state per channel: Telegram's bound chat and update cursor, Discord's
 * "webhook gone". Never tokens or URLs: those stay in the environment.
 */
export function createChannelState(db: Database) {
  const read = db.query<{ config: string }, [string]>(
    "SELECT config FROM channel_state WHERE channel = ?",
  );
  return {
    get<T extends object>(channel: string): Partial<T> {
      const row = read.get(channel);
      try {
        return row ? (JSON.parse(row.config) as Partial<T>) : {};
      } catch {
        return {};
      }
    },
    set(channel: string, config: object, at: number) {
      db.run(
        `INSERT INTO channel_state (channel, config, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (channel) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
        [channel, JSON.stringify(config), at],
      );
    },
  };
}
export type ChannelState = ReturnType<typeof createChannelState>;

/** A short fingerprint, so state can say which secret it was about without storing it. */
export const fingerprint = (secret: string) =>
  new Bun.CryptoHasher("sha256").update(secret).digest("hex").slice(0, 16);
