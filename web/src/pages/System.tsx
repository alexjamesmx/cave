import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { parseDefinition } from "../../../shared/flows/registry.ts";
import { nextSlot } from "../../../shared/flows/schedule.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone } from "../app/hooks.ts";
import { ownerGet } from "../app/owner-api.ts";
import { collectionPath, flowPath } from "../app/router.ts";
import {
  collectionStats,
  flowEntries,
  jobEntries,
  mergeSchedule,
  reminderEntries,
  SCHEDULE_DAYS,
} from "../logic/system.ts";
import { titleOf } from "../logic/views.ts";
import { useAllItems, useCollections, useItems } from "../store/queries.ts";
import { ApproveButtons } from "../ui/flows/PendingFlows.tsx";

/** `GET /api/system`, as `server/system/report.ts` builds it. */
interface SystemReport {
  version: string;
  commit: string | null;
  deploy: { sha: string; result: string; step?: string; at: string; running: string } | null;
  deployNextAt: number | null;
  lastBackupAt: number | null;
  integrations: { id: string; label: string; ready: boolean; summary: string }[];
  jobs: {
    id: string;
    label: string;
    schedule: string;
    lastRun?: number;
    nextRun: number;
    lastResult?: string;
    lastSummary?: string;
  }[];
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
type Server = SystemReport | "offline" | undefined;

const TABS = [
  ["overview", "Overview"],
  ["schedules", "Schedules"],
  ["jobs", "Jobs"],
  ["flows", "Flows"],
  ["agents", "Agents"],
  ["notifications", "Notifications"],
] as const;
type Tab = (typeof TABS)[number][0];

const when = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "—");

export function System({ tab }: { tab: string | undefined }) {
  const current: Tab = TABS.some(([id]) => id === tab) ? (tab as Tab) : "overview";
  const [server, setServer] = useState<Server>();
  const load = useCallback(async () => {
    setServer((await ownerGet<SystemReport>("/api/system")) ?? "offline");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em", flex: 1 }}>System</h1>
        <button type="button" className="btn" onClick={() => void load()}>
          Refresh
        </button>
      </header>
      <nav aria-label="System sections" className="system-tabs">
        {TABS.map(([id, label]) => (
          <a
            key={id}
            href={id === "overview" ? "/system" : `/system/${id}`}
            aria-current={id === current ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {current === "overview" && <Overview server={server} />}
      {current === "schedules" && <Schedules server={server} />}
      {current === "jobs" && <Jobs server={server} />}
      {current === "flows" && <Flows server={server} />}
      {current === "agents" && <Agents server={server} />}
      {current === "notifications" && <Notifications server={server} />}
    </>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
      <span className="k">{title}</span>
      {children}
    </section>
  );
}

const Offline = ({ what }: { what: string }) => (
  <span className="muted">{what} need the server: offline.</span>
);

/** Rows that stack on a phone: a label, then its details. */
function Row({ children }: { children: ReactNode }) {
  return <div className="system-row">{children}</div>;
}

function Overview({ server }: { server: Server }) {
  const { db } = useCave().local;
  const collections = useCollections(db) ?? [];
  const items = useAllItems(db);
  const stats = useMemo(() => collectionStats(items ?? []), [items]);
  return (
    <>
      <Panel title="Collections">
        {collections.map((c) => {
          const s = stats.get(c.id);
          return (
            <Row key={c.id}>
              {c.id === FLOWS || !c.data.hidden ? (
                <a className="link" href={c.id === FLOWS ? "/flows" : collectionPath(c.id)}>
                  {c.data.name}
                </a>
              ) : (
                <span>{c.data.name}</span>
              )}
              <span className="num">{s?.count ?? 0}</span>
              <span className="muted">last change {when(s?.lastChange)}</span>
            </Row>
          );
        })}
      </Panel>
      <Panel title="Server">
        {server === "offline" && <Offline what="Server details" />}
        {typeof server === "object" && (
          <>
            <Row>
              <span>Running</span>
              <span className="num">
                {server.version} · {short(server.commit)}
              </span>
            </Row>
            <Row>
              <span>Last deploy</span>
              <span className="num">
                {server.deploy
                  ? `${server.deploy.result}${server.deploy.step ? ` (${server.deploy.step})` : ""} · ${short(server.deploy.sha)} · ${when(Date.parse(server.deploy.at))}`
                  : "none recorded"}
              </span>
            </Row>
            <Row>
              <span>Last backup</span>
              <span className="num">{when(server.lastBackupAt)}</span>
            </Row>
          </>
        )}
      </Panel>
      <Panel title={`Devices · last 30 days`}>
        {server === "offline" && <Offline what="Devices" />}
        {typeof server === "object" &&
          (server.devices.length === 0 ? (
            <span className="muted">No device synced yet.</span>
          ) : (
            server.devices.map((d) => (
              <Row key={d.id}>
                <span>{d.label ?? "Unnamed device"}</span>
                <span className="num muted">{d.id.slice(0, 8)}</span>
                <span className="muted">{when(d.lastSeen)}</span>
              </Row>
            ))
          ))}
      </Panel>
      <Panel title="Integrations">
        {server === "offline" && <Offline what="Integrations" />}
        {typeof server === "object" &&
          server.integrations.map((i) => (
            <Row key={i.id}>
              <span>{i.label}</span>
              <span
                className="chip"
                style={{ background: "#11141a", color: i.ready ? "var(--income)" : "var(--gold)" }}
              >
                {i.ready ? "ready" : "not ready"}
              </span>
              <span className="muted">{i.summary}</span>
            </Row>
          ))}
      </Panel>
    </>
  );
}

function Schedules({ server }: { server: Server }) {
  const { db } = useCave().local;
  const reminders = useItems(db, "reminders");
  const flows = useItems(db, FLOWS);
  const zone = useReminderZone();
  const now = useNow().getTime();
  const entries = useMemo(() => {
    const to = now + SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
    return mergeSchedule(
      reminderEntries(reminders ?? [], zone, now, to),
      flowEntries(flows ?? [], zone, now, to),
      typeof server === "object" ? jobEntries(server.jobs, server.deployNextAt, now) : [],
    );
  }, [reminders, flows, zone, now, server]);
  return (
    <Panel title={`Next ${SCHEDULE_DAYS} days`}>
      {server === "offline" && <Offline what="Job times" />}
      {entries.length === 0 && <span className="muted">Nothing scheduled.</span>}
      {entries.map((e) => (
        <Row key={e.key}>
          <span className="num">
            {e.approximate ? "≈ " : ""}
            {when(e.at)}
          </span>
          <span className="chip" style={{ background: "#11141a" }}>
            {e.kind}
          </span>
          <a className="link" href={e.path}>
            {e.label}
          </a>
        </Row>
      ))}
    </Panel>
  );
}

function Jobs({ server }: { server: Server }) {
  if (server === "offline") return <Offline what="Jobs" />;
  if (!server) return null;
  return (
    <>
      <Panel title="Jobs">
        {server.jobs.map((j) => (
          <Row key={j.id}>
            <strong>{j.label}</strong>
            <span className="muted">{j.schedule}</span>
            <span className="muted">last {when(j.lastRun)}</span>
            <span className="muted">next {when(j.nextRun)}</span>
            <span>{j.lastResult ? `${j.lastResult} · ${j.lastSummary ?? ""}` : "not run yet"}</span>
          </Row>
        ))}
        <Row>
          <strong>Deploy (on the VPS)</strong>
          <span className="muted">about every 2 minutes</span>
          <span className="muted">
            {server.deploy ? `last ${when(Date.parse(server.deploy.at))}` : "no status"}
          </span>
          <span className="muted">≈ next {when(server.deployNextAt)}</span>
          <span>{server.deploy?.result ?? "—"}</span>
        </Row>
      </Panel>
      <Panel title="Recent runs">
        {server.jobRuns.length === 0 && <span className="muted">No recorded runs yet.</span>}
        {server.jobRuns.map((r) => (
          <Row key={`${r.job}-${r.startedAt}`}>
            <span className="num muted">{when(r.startedAt)}</span>
            <span>{r.job}</span>
            <span>{r.result}</span>
            <span className="muted">{r.summary}</span>
          </Row>
        ))}
      </Panel>
    </>
  );
}

function Flows({ server }: { server: Server }) {
  const { db } = useCave().local;
  const flows = useItems(db, FLOWS) ?? [];
  const zone = useReminderZone();
  const now = useNow().getTime();
  const runs = new Map(typeof server === "object" ? server.flowRuns.map((r) => [r.flowId, r]) : []);
  const next = (flow: Doc) => {
    const parsed = parseDefinition(flow.data.definition);
    if (flow.data.status !== "on" || !parsed.ok || parsed.value.trigger.type !== "schedule")
      return undefined;
    return nextSlot(parsed.value.trigger, now, zone.timeZone);
  };
  return (
    <Panel title="Flows">
      <a className="link" href="/flows">
        Open the Flows page
      </a>
      {server === "offline" && <Offline what="Last runs" />}
      {flows.map((f) => {
        const run = runs.get(f.id);
        const n = next(f);
        return (
          <Row key={f.id}>
            <a className="link" href={flowPath(f.id)}>
              {titleOf(f)}
            </a>
            <span className="chip" style={{ background: "#11141a" }}>
              {String(f.data.status)}
            </span>
            <span className="muted">by {String(f.data.author ?? "owner")}</span>
            <span className="muted">
              {run ? `last ${when(run.lastAt)} · ${run.result}` : "never run"}
            </span>
            <span className="muted">{n ? `next ${when(n)}` : ""}</span>
            {f.data.status === "pending-approval" && (
              <span style={{ display: "flex", gap: 8 }}>
                <ApproveButtons flow={f} />
              </span>
            )}
          </Row>
        );
      })}
    </Panel>
  );
}

function Agents({ server }: { server: Server }) {
  const { db } = useCave().local;
  const flows = useItems(db, FLOWS) ?? [];
  if (server === "offline") return <Offline what="Agents" />;
  if (!server) return null;
  return (
    <Panel title="Agents">
      <a className="link" href="/agents">
        Open the Agents page
      </a>
      {server.agents.length === 0 && <span className="muted">No agents yet.</span>}
      {server.agents.map((a) => (
        <Row key={a.name}>
          <strong>{a.name}</strong>
          <span className="muted">{a.revoked ? "revoked" : a.scopes.join(" · ")}</span>
          <span className="muted">last call {when(a.lastCall)}</span>
          <span className="num">{a.calls7d} calls in 7 days</span>
          <span className="num">
            {a.created} items · {flows.filter((f) => f.data.author === a.name).length} flows
          </span>
        </Row>
      ))}
    </Panel>
  );
}

function Notifications({ server }: { server: Server }) {
  if (server === "offline") return <Offline what="Notifications" />;
  if (!server) return null;
  return (
    <Panel title="Notification log">
      <span className="muted">
        {server.notifications.missed} missed reminder
        {server.notifications.missed === 1 ? "" : "s"} · titles are never stored
      </span>
      {server.notifications.log.length === 0 && <span className="muted">Nothing sent yet.</span>}
      {server.notifications.log.map((n, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one send can log the same key per channel
        <Row key={`${n.key}-${n.channel}-${i}`}>
          <span className="num muted">{when(n.at)}</span>
          <span>{n.channel}</span>
          <span className="num">{n.key}</span>
          <span>{n.result}</span>
        </Row>
      ))}
    </Panel>
  );
}
