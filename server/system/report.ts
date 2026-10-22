import type { Database } from "bun:sqlite";
import type { AgentRegistry } from "../agents.ts";
import { newestBackupAt } from "../backup.ts";
import { type DeployStatus, readDeployStatus } from "../deploy-status.ts";
import type { CaveEnv } from "../env.ts";
import type { JobState } from "../jobs/scheduler.ts";
import type { Notifier } from "../notify/notifier.ts";
import { type OffsiteStatus, readOffsiteStatus } from "../offsite-status.ts";

const DEVICE_DAYS = 30;
const AGENT_DAYS = 7;
const JOB_RUNS = 50;
const NOTIFICATION_ROWS = 100;
/** `cave-deploy.timer` runs 2 minutes after its last run ended. */
const DEPLOY_EVERY_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What only the server knows, for `/system`. It names things by id, channel and key: never a
 * token, key, webhook URL, push endpoint, chat id or notification title.
 */
export interface SystemReport {
  /** Anything but `production` sends to the outbox: `notifications.log` rows with result `outbox`. */
  env: CaveEnv;
  version: string;
  commit: string | null;
  deploy: DeployStatus | null;
  /** The deploy timer's next check, approximate; `null` off the VPS. */
  deployNextAt: number | null;
  lastBackupAt: number | null;
  /** `cave-offsite`'s last backup and check; `null` when not set up. */
  offsite: OffsiteStatus | null;
  integrations: { id: string; label: string; ready: boolean; summary: string }[];
  jobs: JobState[];
  jobRuns: {
    job: string;
    startedAt: number;
    finishedAt: number;
    result: string;
    summary: string;
  }[];
  flowRuns: { flowId: string; lastAt: number; result: string }[];
  notifications: {
    log: { at: number; channel: string; key: string; result: string }[];
    missed: number;
  };
  devices: { id: string; label: string | null; lastSeen: number }[];
  agents: {
    name: string;
    scopes: string[];
    revoked: boolean;
    lastCall: number | null;
    calls7d: number;
    created: number;
  }[];
}

interface ReportDeps {
  env: CaveEnv;
  db: Database;
  version: string;
  commit: string | null;
  backupDir: string;
  deployStatusPath: string | undefined;
  offsiteStatusPath?: string | undefined;
  jobs: () => JobState[];
  notifier: Notifier;
  agents: AgentRegistry;
  /** Devices seen by `/api/sync` since start, pulls included; writes come from the change log. */
  syncs: () => Map<string, number>;
  now: () => number;
}

export function createSystemReport(d: ReportDeps) {
  const jobRuns = d.db.query<
    { job: string; started_at: number; finished_at: number; result: string; summary: string },
    [number]
  >("SELECT job, started_at, finished_at, result, summary FROM job_runs ORDER BY seq DESC LIMIT ?");
  // The newest run of each flow; `max()` makes SQLite take the other columns from that row.
  const flowRuns = d.db.query<{ flow_id: string; at: number; result: string }, []>(
    "SELECT flow_id, max(started_at) AS at, result FROM flow_runs GROUP BY flow_id",
  );
  const log = d.db.query<
    { sent_at: number; channel: string; key: string; result: string },
    [number]
  >("SELECT sent_at, channel, key, result FROM notification_log ORDER BY seq DESC LIMIT ?");
  const missed = d.db.query<{ n: number }, []>(
    "SELECT count(*) AS n FROM notification_log WHERE result = 'missed'",
  );
  const writers = d.db.query<{ actor: string; at: number }, [number]>(
    "SELECT actor, max(at) AS at FROM changes WHERE actor LIKE 'user:%' AND at >= ? GROUP BY actor",
  );
  const labels = d.db.query<{ device_id: string; label: string }, []>(
    "SELECT device_id, label FROM push_subscriptions",
  );
  const calls = d.db.query<{ agent: string; n: number }, [number]>(
    "SELECT agent, count(*) AS n FROM agent_calls WHERE at >= ? GROUP BY agent",
  );
  const lastCalls = d.db.query<{ agent: string; at: number }, []>(
    "SELECT agent, max(at) AS at FROM agent_calls GROUP BY agent",
  );
  // A change that set `_created` made the doc; `keys` is a JSON array of key names.
  const created = d.db.query<{ actor: string; n: number }, []>(
    `SELECT actor, count(*) AS n FROM changes
     WHERE actor LIKE 'agent:%' AND keys LIKE '%"_created"%' GROUP BY actor`,
  );

  function devices(now: number): SystemReport["devices"] {
    const seen = new Map<string, number>();
    for (const row of writers.all(now - DEVICE_DAYS * DAY_MS))
      seen.set(row.actor.slice("user:".length), row.at);
    for (const [id, at] of d.syncs())
      if (at >= now - DEVICE_DAYS * DAY_MS) seen.set(id, Math.max(at, seen.get(id) ?? 0));
    const named = new Map(labels.all().map((r) => [r.device_id, r.label]));
    return [...seen]
      .map(([id, lastSeen]) => ({ id, label: named.get(id) ?? null, lastSeen }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  return (): SystemReport => {
    const now = d.now();
    const deploy = readDeployStatus(d.deployStatusPath);
    const deployAt = deploy ? Date.parse(deploy.at) : undefined;
    const backup = newestBackupAt(d.backupDir);
    const recentCalls = new Map(calls.all(now - AGENT_DAYS * DAY_MS).map((r) => [r.agent, r.n]));
    const last = new Map(lastCalls.all().map((r) => [r.agent, r.at]));
    const made = new Map(created.all().map((r) => [r.actor.slice("agent:".length), r.n]));
    return {
      env: d.env,
      version: d.version,
      commit: d.commit,
      deploy,
      deployNextAt: deployAt === undefined ? null : Math.max(deployAt + DEPLOY_EVERY_MS, now),
      lastBackupAt: backup ?? null,
      offsite: readOffsiteStatus(d.offsiteStatusPath),
      integrations: d.notifier.statuses().map((s) => ({
        id: s.id,
        label: s.label,
        ready: s.status.ready,
        summary: s.status.summary,
      })),
      jobs: d.jobs(),
      jobRuns: jobRuns.all(JOB_RUNS).map((r) => ({
        job: r.job,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        result: r.result,
        summary: r.summary,
      })),
      flowRuns: flowRuns.all().map((r) => ({ flowId: r.flow_id, lastAt: r.at, result: r.result })),
      notifications: {
        log: log.all(NOTIFICATION_ROWS).map((r) => ({
          at: r.sent_at,
          channel: r.channel,
          key: r.key,
          result: r.result,
        })),
        missed: missed.get()?.n ?? 0,
      },
      devices: devices(now),
      agents: d.agents.list().map((a) => ({
        name: a.name,
        scopes: a.scopes,
        revoked: a.revoked !== null,
        lastCall: last.get(a.name) ?? null,
        calls7d: recentCalls.get(a.name) ?? 0,
        created: made.get(a.name) ?? 0,
      })),
    };
  };
}
export type SystemReportFn = ReturnType<typeof createSystemReport>;
