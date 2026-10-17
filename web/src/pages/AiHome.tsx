import { useEffect, useMemo, useState } from "react";
import { AI } from "../../../shared/ai.ts";
import { buildOverview, type OverviewInput } from "../../../shared/ai-overview.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { useActivity } from "../app/activity.ts";
import { useCave } from "../app/context.ts";
import { ownerGet } from "../app/owner-api.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { useItems } from "../store/queries.ts";
import { ActivityList } from "../ui/Activity.tsx";
import { AiMap } from "../ui/AiMap.tsx";

/**
 * AI → Overview: the whole AI setup at a glance, for seeing rather than working. Counts on top,
 * then a read-only map. Agent tokens and jobs come from the server; offline, the rest still shows.
 */
export function AiOverview() {
  const { db } = useCave().local;
  const items = useItems(db, AI);
  const flows = useItems(db, FLOWS);
  const { entries } = useActivity();
  const [server, setServer] = useState<{
    agents: OverviewInput["agents"];
    jobs: OverviewInput["jobs"];
    telegram?: { ready: boolean };
  }>();
  useEffect(() => {
    void Promise.all([
      ownerGet<{ agents: OverviewInput["agents"] }>("/api/agents"),
      ownerGet<{
        jobs: { id: string; label: string; lastRun?: number; lastResult?: string }[];
        integrations: { id: string; ready: boolean }[];
      }>("/api/system"),
    ]).then(([a, s]) => {
      const telegram = s?.integrations.find((i) => i.id === "telegram");
      setServer({
        agents: a?.agents ?? [],
        jobs: s?.jobs ?? [],
        ...(telegram ? { telegram: { ready: telegram.ready } } : {}),
      });
    });
  }, []);
  const overview = useMemo(
    () =>
      buildOverview({
        ai: items ?? [],
        flows: flows ?? [],
        agents: server?.agents ?? [],
        jobs: server?.jobs ?? [],
        telegram: server?.telegram,
        activity: entries,
        now: Date.now(),
      }),
    [items, flows, server, entries],
  );
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section aria-label="AI setup" className="stats">
        {overview.counts.map((c) => (
          <div key={c.label} className="panel stat">
            <span className="k">{c.label}</span>
            <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>
              {c.value}
            </span>
          </div>
        ))}
      </section>
      {server === undefined && (
        <p className="muted" style={{ margin: 0 }}>
          Agent tokens and jobs show when the server answers.
        </p>
      )}
      <AiMap nodes={overview.nodes} edges={overview.edges} />
    </div>
  );
}

const SOURCES = ["agent", "flow", "job"] as const;
const STATUSES = ["running", "waiting", "done", "failed", "cancelled", "skipped"] as const;

/** AI → Activity: every run, agents', flows' and jobs', filterable by source and status. */
export function AiActivity() {
  const { entries, server } = useActivity();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const source = params.get("source") ?? "";
  const status = params.get("status") ?? "";
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    const q = next.toString();
    setSearch(q ? `?${q}` : "");
  };
  const shown = entries
    .filter((e) => !source || e.source === source)
    .filter((e) => !status || e.status === status);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          className="input"
          aria-label="Source"
          value={source}
          onChange={(e) => filter("source", e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Every source</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Status"
          value={status}
          onChange={(e) => filter("status", e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {!server && (
        <p className="muted" style={{ margin: 0 }}>
          Offline: agents' runs only; flows and jobs show when the server answers.
        </p>
      )}
      <ActivityList entries={shown} label="All runs" showSource />
    </div>
  );
}
