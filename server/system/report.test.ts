import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import webpush from "web-push";
import { formatStamp } from "../../shared/hlc.ts";
import { seedDocs } from "../../shared/seed.ts";
import { createCallLog } from "../agent-calls.ts";
import { createAgentRegistry } from "../agents.ts";
import { serveCave } from "../app.ts";
import { openDb } from "../db.ts";
import { createScheduler } from "../jobs/scheduler.ts";
import { createChannelState } from "../notify/channel-state.ts";
import { createNotificationSystem } from "../notify/system.ts";
import { createSubscriptions } from "../notify/webpush.ts";
import { createStore } from "../store.ts";
import { createSystemReport, type SystemReport } from "./report.ts";

const OWNER = "owner-secret-token-0123456789abcdef";
const NOW = Date.parse("2026-10-15T16:00:00Z");
const vapid = { subject: "mailto:o@example.com", ...webpush.generateVAPIDKeys() };
const TELEGRAM = `123456789:${"T".repeat(35)}`;
const DISCORD = "https://discord.com/api/webhooks/1/discord-secret";
const ENDPOINT = "https://push.example.test/send/very-secret-endpoint";
const P256DH = "BPushKeyThatMustNotLeak";
const AUTH = "auth-secret-must-not-leak";
const CHAT_ID = 987654321;
const SHA = "a".repeat(40);

let server: ReturnType<typeof serveCave>;
let dir: string;
let agentToken = "";
let report: SystemReport;
let raw = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cave-system-"));
  const db = openDb(":memory:");
  const store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  const registry = createAgentRegistry(db);
  const added = registry.add("claude", ["read", "write"], null, NOW - 1000);
  if (!added.ok) throw new Error(added.error);
  agentToken = added.value.token;
  const calls = createCallLog(db);
  calls.record({
    agent: "claude",
    tool: "create",
    args: "{}",
    at: NOW - 60_000,
    ok: true,
    error: null,
    changeSeqs: [],
  });
  const stamp = formatStamp(NOW - 60_000, 0, "agent-claude");
  store.applyChanges(
    [
      {
        id: "t1",
        kind: "item",
        collection: "tasks",
        data: { _created: "2026-10-15T15:59:00Z", _title: "From an agent" },
        stamps: { _created: stamp, _title: stamp },
        actor: "agent:claude",
      },
    ],
    "agent:claude",
    NOW - 60_000,
  );
  const phone = formatStamp(NOW - 120_000, 0, "phone");
  store.applyChanges(
    [
      {
        id: "t2",
        kind: "item",
        collection: "tasks",
        data: { _title: "From the phone" },
        stamps: { _title: phone },
        actor: "user:phone",
      },
    ],
    "user:phone",
    NOW - 120_000,
  );
  createSubscriptions(db).upsert(
    { endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH },
    "phone",
    "iPhone",
    NOW,
  );
  createChannelState(db).set("telegram", { offset: 5, chatId: CHAT_ID }, NOW);
  db.run(
    "INSERT INTO notification_log (key, channel, sent_at, result) VALUES ('reminder:r1:2026-10-15T09:00', 'webpush', ?, 'delivered')",
    [NOW - 5000],
  );
  db.run(
    "INSERT INTO flow_runs (key, flow_id, started_at, result, log) VALUES ('k1', 'flow-rent', ?, 'ok', '[]'), ('k2', 'flow-rent', ?, 'stopped', '[]')",
    [NOW - 9000, NOW - 3000],
  );
  const offsitePath = join(dir, "offsite.json");
  writeFileSync(
    offsitePath,
    JSON.stringify({
      backup: {
        at: new Date(NOW - 7_200_000).toISOString(),
        ok: true,
        snapshot: "01ebed8a",
        docs: 3,
        file: "cave-2026-10-16T0300.db",
        error: "",
      },
      check: null,
    }),
  );
  const statusPath = join(dir, "status.json");
  writeFileSync(
    statusPath,
    JSON.stringify({
      sha: SHA,
      result: "deployed",
      at: new Date(NOW - 30_000).toISOString(),
      running: SHA,
    }),
  );

  const system = createNotificationSystem({
    db,
    store,
    now: () => NOW,
    origin: "https://cave.example.dev",
    push: vapid,
    telegramToken: TELEGRAM,
    discordWebhook: DISCORD,
    production: true,
    env: "production",
    fetch: (async () => Response.json({ ok: true, result: [] })) as unknown as typeof fetch,
    log: () => {},
  });
  const scheduler = createScheduler({ jobs: system.jobs, db, now: () => NOW, log: () => {} });
  await scheduler.tick();
  db.run(
    "INSERT INTO job_runs (job, started_at, finished_at, result, summary) VALUES ('reminders', ?, ?, 'ok', '1 sent, 0 missed')",
    [NOW - 4000, NOW - 3900],
  );
  server = serveCave({
    hostname: "127.0.0.1",
    port: 0,
    store,
    token: OWNER,
    now: () => NOW,
    agents: { registry, calls, vaultPath: undefined },
    system: createSystemReport({
      env: "production",
      db,
      version: "0.1.0",
      commit: SHA,
      backupDir: dir,
      deployStatusPath: statusPath,
      offsiteStatusPath: offsitePath,
      jobs: () => scheduler.status(),
      notifier: system.notifier,
      agents: registry,
      syncs: () => new Map([["laptop", NOW - 1000]]),
      now: () => NOW,
    }),
  });
  const res = await fetch(new URL("/api/system", server.url), {
    headers: { authorization: `Bearer ${OWNER}` },
  });
  expect(res.status).toBe(200);
  raw = await res.text();
  report = JSON.parse(raw) as SystemReport;
});

afterAll(() => {
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

test("the report has jobs, runs, deploy, devices, agents, flows and the notification log", () => {
  expect(report.commit).toBe(SHA);
  expect(report.deploy?.result).toBe("deployed");
  expect(report.deployNextAt).toBe(NOW - 30_000 + 2 * 60_000);
  expect(report.env).toBe("production");
  expect(report.offsite).toMatchObject({ backup: { ok: true, snapshot: "01ebed8a" }, check: null });
  expect(report.jobs.map((j) => j.id)).toEqual(["reminders", "flows", "telegram"]);
  expect(report.jobs.every((j) => j.lastRun === NOW)).toBe(true);
  expect(report.jobRuns[0]).toMatchObject({ job: "reminders", summary: "1 sent, 0 missed" });
  expect(report.flowRuns).toEqual([{ flowId: "flow-rent", lastAt: NOW - 3000, result: "stopped" }]);
  expect(report.notifications).toEqual({
    log: [
      {
        at: NOW - 5000,
        channel: "webpush",
        key: "reminder:r1:2026-10-15T09:00",
        result: "delivered",
      },
    ],
    missed: 0,
  });
  expect(report.devices).toEqual([
    { id: "laptop", label: null, lastSeen: NOW - 1000 },
    { id: "phone", label: "iPhone", lastSeen: NOW - 120_000 },
  ]);
  expect(report.agents).toEqual([
    {
      name: "claude",
      scopes: ["read", "write"],
      revoked: false,
      lastCall: NOW - 60_000,
      calls7d: 1,
      created: 1,
    },
  ]);
  expect(report.integrations.map((i) => [i.id, i.ready])).toEqual([
    ["webpush", true],
    ["telegram", true],
    ["discord", true],
  ]);
});

test("no token, key, webhook, endpoint or chat id appears anywhere in the answer", () => {
  for (const secret of [
    OWNER,
    agentToken,
    vapid.privateKey,
    vapid.publicKey,
    TELEGRAM,
    "TTTTTTTTTT",
    DISCORD,
    "discord-secret",
    ENDPOINT,
    "very-secret-endpoint",
    P256DH,
    AUTH,
    String(CHAT_ID),
  ])
    expect(raw).not.toContain(secret);
});

test("only the owner gets it: no token, and an agent's token, are refused", async () => {
  const url = new URL("/api/system", server.url);
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(url, { headers: { authorization: `Bearer ${agentToken}` } })).status).toBe(
    401,
  );
});
