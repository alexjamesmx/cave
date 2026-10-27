import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { OffsiteStatus } from "../../../../server/offsite-status.ts";
import { ownerGet } from "../../app/owner-api.ts";

/** The one settings doc every page here writes to. */
export const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };

/** `GET /api/system`, as `server/system/report.ts` builds it. */
export interface SystemReport {
  version: string;
  commit: string | null;
  deploy: { sha: string; result: string; step?: string; at: string; running: string } | null;
  deployNextAt: number | null;
  lastBackupAt: number | null;
  offsite: OffsiteStatus | null;
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
  /** `CAVE_ENV`; anything but production sends to the outbox. */
  env: string;
  notifications: {
    log: { at: number; channel: string; key: string; result: string }[];
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

/** The report, "offline" when the server did not answer, undefined while loading. */
export type Server = SystemReport | "offline" | undefined;

/** The system report, loaded once; `reload` asks again. */
export function useSystemReport(): { server: Server; reload(): void } {
  const [server, setServer] = useState<Server>();
  const reload = useCallback(() => {
    void ownerGet<SystemReport>("/api/system").then((r) => setServer(r ?? "offline"));
  }, []);
  useEffect(reload, [reload]);
  return { server, reload };
}

export const when = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
export const isoWhen = (iso: string) => when(Date.parse(iso));
export const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "—");

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
      <span className="k">{title}</span>
      {children}
    </section>
  );
}

export const Offline = ({ what }: { what: string }) => (
  <span className="muted">{what} need the server: offline.</span>
);

/** Rows that stack on a phone: a label, then its details. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="sub-row">{children}</div>;
}

/** Sub-sections of one Settings page, as links under `base`. */
export function SubTabs({
  label,
  base,
  tabs,
  current,
}: {
  label: string;
  base: string;
  tabs: readonly (readonly [string, string])[];
  current: string;
}) {
  return (
    <nav aria-label={label} className="sub-tabs">
      {tabs.map(([id, text], i) => (
        <a
          key={id}
          href={i === 0 ? base : `${base}/${id}`}
          aria-current={id === current ? "page" : undefined}
        >
          {text}
        </a>
      ))}
    </nav>
  );
}
