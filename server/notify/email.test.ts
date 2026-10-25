import { expect, test } from "bun:test";
import { createEmailChannel, emailText } from "./email.ts";
import type { Message } from "./types.ts";

const CONFIG = { apiKey: "re_secret", from: "Cave <cave@example.dev>", to: "alex@example.dev" };
const message: Message = {
  key: "reminder:r1:2026-10-22T09:00",
  kind: "reminder",
  itemId: "r1",
  title: "Pay rent",
  body: "Thu Oct 22, 09:00 · Repeats monthly",
  lines: ["Thu Oct 22, 09:00", "Repeats monthly"],
  url: "https://cave.example.dev/r/r1",
  actions: [{ id: "done", label: "Done", url: "https://cave.example.dev/r/r1?do=done" }],
};

function setup(statuses: number[], config: typeof CONFIG | null = CONFIG) {
  const calls: { url: string; init: RequestInit }[] = [];
  const slept: number[] = [];
  const logged: string[] = [];
  const channel = createEmailChannel({
    config: config ?? undefined,
    now: () => 1_000,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const status = statuses.shift() ?? 200;
      return new Response(status === 429 ? "{}" : '{"id":"x"}', {
        status,
        headers: status === 429 ? { "retry-after": "2" } : {},
      });
    }) as unknown as typeof fetch,
    sleep: async (ms) => {
      slept.push(ms);
    },
    log: (line) => logged.push(line),
  });
  return { channel, calls, slept, logged };
}

test("without the three settings the channel is not ready and sends nothing", async () => {
  const { channel, calls } = setup([], null);
  expect(channel.status()).toEqual({
    ready: false,
    summary: "needs CAVE_RESEND_API_KEY, CAVE_EMAIL_FROM and CAVE_EMAIL_TO",
  });
  expect(await channel.send(message)).toEqual({ delivered: 0, failed: 0 });
  expect(calls).toEqual([]);
});

test("a send is one POST to Resend with the key, the addresses, a text body and an idempotency key", async () => {
  const { channel, calls, logged } = setup([200]);
  expect(channel.status()).toEqual({ ready: true, summary: "to alex@example.dev" });
  expect(await channel.send(message)).toEqual({ delivered: 1, failed: 0 });
  const [call] = calls;
  expect(call?.url).toBe("https://api.resend.com/emails");
  const headers = call?.init.headers as Record<string, string>;
  expect(headers.authorization).toBe("Bearer re_secret");
  expect(headers["idempotency-key"]).toBe("reminder:r1:2026-10-22T09:00:1000");
  expect(JSON.parse(call?.init.body as string)).toEqual({
    from: "Cave <cave@example.dev>",
    to: ["alex@example.dev"],
    subject: "Pay rent",
    text: [
      "Thu Oct 22, 09:00",
      "Repeats monthly",
      "",
      "Open: https://cave.example.dev/r/r1",
      "Done: https://cave.example.dev/r/r1?do=done",
    ].join("\n"),
  });
  // Only the status is logged: no key, no address, no title.
  expect(logged).toEqual(["email: 200"]);
});

test("titles only: the body holds the links and nothing else", () => {
  expect(emailText({ ...message, lines: [], actions: [] })).toBe(
    "Open: https://cave.example.dev/r/r1",
  );
});

test("a 429 waits retry-after and tries once more; a 5xx is a failed delivery", async () => {
  const retried = setup([429, 200]);
  expect(await retried.channel.send(message)).toEqual({ delivered: 1, failed: 0 });
  expect(retried.slept).toEqual([2000]);
  expect(retried.calls).toHaveLength(2);
  const failed = setup([500]);
  expect(await failed.channel.send(message)).toEqual({ delivered: 0, failed: 1 });
  expect(failed.calls).toHaveLength(1);
});
