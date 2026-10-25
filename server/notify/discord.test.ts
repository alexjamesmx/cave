import { expect, test } from "bun:test";
import { openDb } from "../db.ts";
import { createChannelState } from "./channel-state.ts";
import { createDiscordChannel } from "./discord.ts";
import type { Message } from "./types.ts";

const WEBHOOK = "https://discord.com/api/webhooks/123/secret-token";
const message: Message = {
  key: "reminder:r1:x",
  kind: "reminder",
  itemId: "r1",
  title: "Pay rent @everyone",
  lines: [],
  url: "https://cave.example.dev/r/r1",
  actions: [],
};

function setup(statuses: number[], webhook: string | null = WEBHOOK) {
  const state = createChannelState(openDb(":memory:"));
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const slept: number[] = [];
  const lines: string[] = [];
  const channel = createDiscordChannel({
    webhook: webhook ?? undefined,
    state,
    now: () => 0,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      const status = statuses.shift() ?? 500;
      return status === 429
        ? Response.json({ retry_after: 1.5 }, { status })
        : new Response(null, { status });
    }) as unknown as typeof fetch,
    sleep: async (ms) => {
      slept.push(ms);
    },
    log: (l) => lines.push(l),
  });
  return { channel, calls, slept, lines, state };
}

test("a plain message with mentions always off, the link to the Cave, and no secret logged", async () => {
  const { channel, calls, lines } = setup([204]);
  expect(await channel.send(message)).toEqual({ delivered: 1, failed: 0 });
  expect(calls).toEqual([
    {
      url: `${WEBHOOK}?wait=true`,
      body: {
        content: "Pay rent @everyone\nOpen: https://cave.example.dev/r/r1",
        allowed_mentions: { parse: [] },
      },
    },
  ]);
  for (const line of lines) expect(line).not.toContain("secret-token");
});

test("429 waits retry_after once; 404 marks the webhook gone until a new one is set", async () => {
  const busy = setup([429, 204]);
  expect(await busy.channel.send(message)).toEqual({ delivered: 1, failed: 0 });
  expect(busy.slept).toEqual([1500]);

  const { channel, state } = setup([404]);
  expect(await channel.send(message)).toEqual({ delivered: 0, failed: 1 });
  expect(channel.status()).toEqual({ ready: false, summary: "webhook gone" });
  expect(JSON.stringify(state.get("discord"))).not.toContain("secret-token");
  const replaced = createDiscordChannel({
    webhook: "https://discord.com/api/webhooks/456/other",
    state,
    now: () => 0,
  });
  expect(replaced.status()).toEqual({ ready: true, summary: "ready" });
});

test("without a webhook it says so and sends nothing", async () => {
  const { channel, calls } = setup([], null);
  expect(channel.status()).toEqual({ ready: false, summary: "needs a webhook URL" });
  expect(await channel.send(message)).toEqual({ delivered: 0, failed: 0 });
  expect(calls).toEqual([]);
});
