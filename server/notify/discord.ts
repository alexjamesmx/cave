import { type ChannelState, fingerprint } from "./channel-state.ts";
import type { NotificationChannel, SendResult } from "./types.ts";
import { retryAfterMs } from "./webpush.ts";

const TIMEOUT_MS = 10_000;
// Discord refuses longer messages.
const MAX_CONTENT = 2000;

interface DiscordState {
  /** The webhook that answered 404, by fingerprint: a new URL clears "gone". */
  gone?: string;
}

interface DiscordOptions {
  webhook: string | undefined;
  state: ChannelState;
  now: () => number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/**
 * One-way: a plain message into one channel through its webhook. No buttons, so acting on it
 * means opening the Cave. `allowed_mentions` is always empty, so no message can ping anyone.
 */
export function createDiscordChannel({
  webhook,
  state,
  now,
  fetch: send = fetch,
  sleep = (ms) => Bun.sleep(ms),
  log = console.log,
}: DiscordOptions): NotificationChannel {
  const id = webhook ? fingerprint(webhook) : undefined;
  const gone = () => id !== undefined && state.get<DiscordState>("discord").gone === id;
  return {
    id: "discord",
    label: "Discord",
    status() {
      if (!webhook) return { ready: false, summary: "needs a webhook URL" };
      if (gone()) return { ready: false, summary: "webhook gone" };
      return { ready: true, summary: "ready" };
    },
    async send(message): Promise<SendResult> {
      if (!webhook || gone()) return { delivered: 0, failed: 0 };
      const lines = [
        message.title,
        ...(message.body ? [message.body] : []),
        `Open: ${message.url}`,
      ];
      const body = JSON.stringify({
        content: lines.join("\n").slice(0, MAX_CONTENT),
        allowed_mentions: { parse: [] },
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await send(`${webhook}?wait=true`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        // The webhook URL is a secret, so only the status is logged.
        log(`discord: ${res.status}`);
        if (res.ok) return { delivered: 1, failed: 0 };
        if (res.status === 404) {
          state.set("discord", { gone: id }, now());
          return { delivered: 0, failed: 1 };
        }
        if (res.status === 429 && attempt === 0) {
          const json = (await res.json().catch(() => ({}))) as { retry_after?: unknown };
          const seconds = typeof json.retry_after === "number" ? String(json.retry_after) : null;
          await sleep(retryAfterMs(seconds ?? res.headers.get("retry-after"), now()));
          continue;
        }
        return { delivered: 0, failed: 1 };
      }
      return { delivered: 0, failed: 1 };
    },
  };
}
