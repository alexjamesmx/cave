import type { Change } from "../shared/types.ts";
import type { AgentCall, CallLog } from "./agent-calls.ts";
import type { AgentRegistry } from "./agents.ts";
import { newestBackupAt } from "./backup.ts";
import { type DeployStatus, readDeployStatus } from "./deploy-status.ts";
import type { CaveEnv } from "./env.ts";
import { type OffsiteStatus, readOffsiteStatus } from "./offsite-status.ts";
import type { Store } from "./store.ts";

export const ACTIVITY_LIMIT = 50;
const ACTIVITY_MAX = 200;

/** `GET /api/agents`: each agent's scopes, allowlist, state and last call; never a hash. */
export function agentsHandler(agents: AgentRegistry, calls: CallLog) {
  return (): Response =>
    Response.json({
      agents: agents.list().map((a) => ({ ...a, lastCall: calls.lastAt(a.name) ?? null })),
    });
}

export interface ActivityEntry extends AgentCall {
  /** The change rows the call wrote, with before and after for undo. */
  changes: Change[];
}

/** `GET /api/activity?before=<seq>&limit=<n>`: agent calls, newest first, with their writes. */
export function activityHandler(store: Store, calls: CallLog) {
  return (req: Request): Response => {
    const params = new URL(req.url).searchParams;
    const before = params.has("before") ? Number(params.get("before")) : undefined;
    const limit = params.has("limit") ? Number(params.get("limit")) : ACTIVITY_LIMIT;
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) {
      return Response.json({ error: "bad before" }, { status: 400 });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > ACTIVITY_MAX) {
      return Response.json({ error: "bad limit" }, { status: 400 });
    }
    const page = calls.page(before, limit);
    const entries: ActivityEntry[] = page.map((call) => ({
      ...call,
      changes: store.changesBySeq(call.changeSeqs),
    }));
    const next = page.length === limit ? (page.at(-1)?.seq ?? null) : null;
    return Response.json({ entries, next });
  };
}

export interface StatusOptions {
  env: CaveEnv;
  version: string;
  /** The deployed git commit; `null` when the server does not run from a git checkout. */
  commit: string | null;
  backupDir: string;
  /** `status.json` written by `cave-deploy`, read on every request; unset on a laptop. */
  deployStatusPath?: string;
  /** `status.json` written by `cave-offsite`, read on every request; unset off the VPS. */
  offsiteStatusPath?: string;
}

export interface Status {
  /** `CAVE_ENV`: the app shows a DEV or TEST badge for anything but `production`. */
  env: CaveEnv;
  version: string;
  commit: string | null;
  docs: number;
  dbId: string;
  lastBackupAt: string | null;
  /** The last deploy on the VPS; `null` without one or when its file is unreadable. */
  deploy: DeployStatus | null;
  /** The off-box backup and its weekly check; `null` when not set up. */
  offsite: OffsiteStatus | null;
}

/** `GET /api/status`: what Settings shows about the server. */
export function statusHandler(store: Store, options: StatusOptions) {
  return (): Response => {
    const last = newestBackupAt(options.backupDir);
    const status: Status = {
      env: options.env,
      version: options.version,
      commit: options.commit,
      docs: store.docCount(),
      dbId: store.dbId(),
      lastBackupAt: last === undefined ? null : new Date(last).toISOString(),
      deploy: readDeployStatus(options.deployStatusPath),
      offsite: readOffsiteStatus(options.offsiteStatusPath),
    };
    return Response.json(status);
  };
}
