import type { HTMLBundle } from "bun";
import type { Hlc } from "../shared/hlc.ts";
import type { CallLog } from "./agent-calls.ts";
import type { AgentRegistry } from "./agents.ts";
import { carriesAgentToken, isAuthorized } from "./auth.ts";
import { exportHandler } from "./export.ts";
import type { FlowRoutes } from "./flows/api.ts";
import { createHistoryHandler } from "./history.ts";
import { createMcpRoute } from "./mcp/route.ts";
import type { NotificationRoutes } from "./notify/api.ts";
import { activityHandler, agentsHandler, type StatusOptions, statusHandler } from "./owner-api.ts";
import { guardRequest, LOOPBACK_HOSTS } from "./request-guard.ts";
import { staticRoutes } from "./static.ts";
import type { Store } from "./store.ts";
import { createSyncHandler, MAX_BODY_BYTES } from "./sync.ts";
import type { SystemReportFn } from "./system/report.ts";

export interface AgentOptions {
  registry: AgentRegistry;
  calls: CallLog;
  vaultPath: string | undefined;
}

export interface AppOptions {
  hostname: string;
  port: number;
  store: Store;
  token: string | undefined;
  now: () => number;
  /** The PWA; every non-API path serves it so client routes survive a reload. */
  web?: HTMLBundle;
  /** The bundled service worker, from `buildServiceWorker()`. */
  serviceWorker?: Response;
  /** Agent access: `/mcp` and the owner's agent pages. Absent means neither is served. */
  agents?: AgentOptions;
  /** Host names `/api` and `/mcp` answer to; see `ServerConfig.allowedHosts`. */
  allowedHosts?: string[];
  /** See `ServerConfig.publicOrigin`. */
  publicOrigin?: string;
  /** `/api/status`; absent means it is not served. */
  status?: StatusOptions;
  /** Push, channel tests and Telegram linking; absent means they are not served. */
  notifications?: NotificationRoutes;
  /** Test runs and run history; absent means they are not served. */
  flows?: FlowRoutes;
  /** `/api/system`; absent means it is not served. */
  system?: SystemReportFn;
  /** Told of each device that syncs; the system view lists them. */
  onSync?: (deviceId: string, at: number) => void;
  /** `false` serves minified, cached bundles; Bun's default follows `NODE_ENV`. */
  development?: boolean;
}

type Handler = (req: Request & { params: Record<string, string> }) => Response | Promise<Response>;

/** The HTTP server; `main.ts` and tests that need a real socket both start it from here. */
export function serveCave({
  hostname,
  port,
  store,
  token,
  now,
  web,
  serviceWorker,
  agents,
  allowedHosts = LOOPBACK_HOSTS,
  publicOrigin,
  status,
  notifications,
  flows,
  system,
  onSync,
  development,
}: AppOptions) {
  const notFound = Response.json({ error: "not found" }, { status: 404 });
  const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
  // Handlers must build a new Response each time; a body can be read only once.
  const missing = () => Response.json({ error: "not found" }, { status: 404 });
  // Host, Origin and body type come first on every /api route and /mcp; see guardRequest.
  // Nothing in between may cache an answer: `/api/export` alone holds the whole database.
  const guarded =
    (handler: Handler): Handler =>
    async (req) => {
      const res = guardRequest(req, allowedHosts, publicOrigin) ?? (await handler(req));
      res.headers.set("cache-control", "no-store");
      return res;
    };
  // The owner API: agent tokens are refused here even when no owner token is configured.
  const owner = (handler: Handler): Handler =>
    guarded((req) => {
      if (carriesAgentToken(req)) return unauthorized();
      if (token !== undefined && !isAuthorized(req, token)) return unauthorized();
      return handler(req);
    });
  const clocks = new Map<string, Hlc>();
  const mcp = agents
    ? guarded(
        createMcpRoute({
          agents: agents.registry,
          deps: { store, calls: agents.calls, vaultPath: agents.vaultPath, now, clocks },
        }),
      )
    : guarded(missing);
  const agentList = agents ? owner(agentsHandler(agents.registry, agents.calls)) : guarded(missing);
  const activity = agents ? owner(activityHandler(store, agents.calls)) : guarded(missing);
  const statusRoute = status ? owner(statusHandler(store, status)) : guarded(missing);
  const n = notifications;
  const notify = (pick: (routes: NotificationRoutes) => Handler): Handler =>
    n ? owner(pick(n)) : guarded(missing);
  return Bun.serve({
    hostname,
    port,
    ...(development === undefined ? {} : { development }),
    maxRequestBodySize: MAX_BODY_BYTES,
    routes: {
      "/api/sync": {
        POST: owner(createSyncHandler({ store, token, now, ...(onSync ? { onSync } : {}) })),
      },
      "/api/history/:id": {
        GET: owner(createHistoryHandler({ store, token }) as Handler),
      },
      "/mcp": mcp,
      "/api/agents": { GET: agentList },
      "/api/activity": { GET: activity },
      "/api/status": { GET: statusRoute },
      "/api/export": { GET: owner(exportHandler(store, now)) },
      "/api/push": { GET: notify((r) => (req) => r.push(req)) },
      "/api/push/subscribe": { POST: notify((r) => (req) => r.subscribe(req)) },
      "/api/push/unsubscribe": { POST: notify((r) => (req) => r.unsubscribe(req)) },
      "/api/push/test": { POST: notify((r) => (req) => r.pushTest(req)) },
      "/api/notifications": { GET: notify((r) => () => r.notifications()) },
      "/api/notifications/test": { POST: notify((r) => (req) => r.channelTest(req)) },
      "/api/telegram/link": { POST: notify((r) => () => r.telegramLink()) },
      "/api/telegram/unlink": { POST: notify((r) => () => r.telegramUnlink()) },
      "/api/system": { GET: system ? owner(() => Response.json(system())) : guarded(missing) },
      "/api/flows/:id/test": { POST: flows ? owner((req) => flows.test(req)) : guarded(missing) },
      "/api/flows/:id/runs": { GET: flows ? owner((req) => flows.runs(req)) : guarded(missing) },
      "/api/*": guarded(missing),
      ...staticRoutes,
      "/sw.js": serviceWorker ?? notFound,
      "/*": web ?? notFound,
    },
    fetch: missing,
  });
}
