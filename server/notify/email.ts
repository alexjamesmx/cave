import type { EmailConfig } from "../config.ts";
import type { Message, NotificationChannel, SendResult } from "./types.ts";
import { retryAfterMs } from "./webpush.ts";

const TIMEOUT_MS = 10_000;
const RESEND = "https://api.resend.com/emails";

interface EmailOptions {
  config: EmailConfig | undefined;
  now: () => number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** Plain text: the title, the lines at full detail, then every link on its own line. */
export function emailText(message: Message): string {
  return [
    ...message.lines,
    ...(message.lines.length ? [""] : []),
    `Open: ${message.url}`,
    ...message.actions.map((a) => `${a.label}: ${a.url}`),
  ].join("\n");
}

/**
 * Email through Resend's HTTP API (M12 part 3), with `fetch` and no SDK: one plain-text message
 * per notification, the notification's key as the idempotency key so a retried send never
 * lands twice. Links open the Cave; Done and Snooze are the same links the app's own
 * notifications carry. Nothing is sent without all three settings.
 */
export function createEmailChannel({
  config,
  now,
  fetch: send = fetch,
  sleep = (ms) => Bun.sleep(ms),
  log = console.log,
}: EmailOptions): NotificationChannel {
  return {
    id: "email",
    label: "Email",
    status() {
      if (!config)
        return {
          ready: false,
          summary: "needs CAVE_RESEND_API_KEY, CAVE_EMAIL_FROM and CAVE_EMAIL_TO",
        };
      return { ready: true, summary: `to ${config.to}` };
    },
    async send(message): Promise<SendResult> {
      if (!config) return { delivered: 0, failed: 0 };
      const body = JSON.stringify({
        from: config.from,
        to: [config.to],
        subject: message.title,
        text: emailText(message),
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await send(RESEND, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": `${message.key}:${now()}`.slice(0, 256),
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        // The key and the addresses are secrets; only the status is logged.
        log(`email: ${res.status}`);
        if (res.ok) return { delivered: 1, failed: 0 };
        if (res.status === 429 && attempt === 0) {
          await sleep(retryAfterMs(res.headers.get("retry-after"), now()));
          continue;
        }
        return { delivered: 0, failed: 1 };
      }
      return { delivered: 0, failed: 1 };
    },
  };
}
