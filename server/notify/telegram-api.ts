import { retryAfterMs } from "./webpush.ts";

const TIMEOUT_MS = 10_000;
const SEND_GAP_MS = 1000;

class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
  ) {
    // The token is part of the request URL, so it never goes into a message.
    super(`telegram ${method}: ${code}`);
    this.name = "TelegramError";
  }
}

interface TelegramApiOptions {
  token: string;
  now: () => number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The Bot API, the only place that holds the token. At most one message a second to the chat;
 * a 429 waits `retry_after` (at most 5 minutes) and tries once more.
 */
export function createTelegramApi({
  token,
  now,
  fetch: send = fetch,
  sleep = (ms) => Bun.sleep(ms),
}: TelegramApiOptions) {
  let lastSend = 0;

  async function call<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = TIMEOUT_MS,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await send(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: T;
        error_code?: number;
        parameters?: { retry_after?: number };
      };
      if (body.ok === true) return body.result as T;
      const code = body.error_code ?? res.status;
      if (code === 429 && attempt === 0) {
        await sleep(retryAfterMs(String(body.parameters?.retry_after ?? 1), now()));
        continue;
      }
      throw new TelegramError(method, code);
    }
    throw new TelegramError(method, 429);
  }

  /** Keeps to one message a second towards the chat. */
  async function paced<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const wait = lastSend + SEND_GAP_MS - now();
    if (wait > 0) await sleep(wait);
    lastSend = now();
    return call<T>(method, params);
  }

  return {
    call,
    sendMessage: (params: Record<string, unknown>) =>
      paced<{ message_id: number }>("sendMessage", params),
    editMessageText: (params: Record<string, unknown>) => paced<unknown>("editMessageText", params),
    answerCallbackQuery: (params: Record<string, unknown>) =>
      call<unknown>("answerCallbackQuery", params),
    /** Long polling: waits up to `timeout` seconds for updates. */
    getUpdates: (offset: number | undefined, timeout: number) =>
      call<TelegramUpdate[]>(
        "getUpdates",
        { ...(offset ? { offset } : {}), timeout, allowed_updates: ["message", "callback_query"] },
        (timeout + 10) * 1000,
      ),
    getMe: () => call<{ username?: string }>("getMe", {}),
  };
}
export type TelegramApi = ReturnType<typeof createTelegramApi>;

export interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}
