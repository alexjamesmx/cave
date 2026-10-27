import { useCallback, useEffect, useState } from "react";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { useCave } from "../app/context.ts";
import { ownerGet } from "../app/owner-api.ts";
import { flowPath, setSearch, useSearch } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { jobPath } from "../ui/flows/look.ts";
import { type FlowRun, ResultChip, StepList } from "../ui/flows/RunHistory.tsx";
import { useSystemReport, when } from "./settings/shared.tsx";

type Source = "flow" | "job";
const SOURCES: [Source | "", string][] = [
  ["", "Everything"],
  ["flow", "Flows"],
  ["job", "System"],
];

type Row =
  | { source: "flow"; at: number; run: FlowRun & { flowId: string } }
  | {
      source: "job";
      at: number;
      run: { job: string; startedAt: number; finishedAt: number; result: string; summary: string };
    };

/**
 * Flows → Runs (M12 part 4): everything the Cave ran on its own, newest first: each flow run
 * with its steps' outcomes and Undo on what it wrote, and each built-in job's run with its
 * result. Agents' runs stay under Projects → Activity.
 */
export function FlowRuns() {
  const { db } = useCave().local;
  const flows = useItems(db, FLOWS) ?? [];
  const { server, reload } = useSystemReport();
  const search = useSearch();
  const source = new URLSearchParams(search).get("source") ?? "";
  const [flowRuns, setFlowRuns] = useState<(FlowRun & { flowId: string })[] | "offline">();
  const load = useCallback(() => {
    void ownerGet<{ runs: (FlowRun & { flowId: string })[] }>("/api/flow-runs").then((r) =>
      setFlowRuns(r?.runs ?? "offline"),
    );
    reload();
  }, [reload]);
  useEffect(load, [load]);
  const title = (id: string) => {
    const flow = flows.find((f) => f.id === id);
    return flow ? titleOf(flow) : id;
  };
  const jobLabel = (id: string) =>
    (typeof server === "object" ? server.jobs.find((j) => j.id === id)?.label : undefined) ?? id;

  const rows: Row[] = [
    ...(Array.isArray(flowRuns)
      ? flowRuns.map((run) => ({ source: "flow" as const, at: run.startedAt, run }))
      : []),
    ...(typeof server === "object"
      ? server.jobRuns.map((run) => ({ source: "job" as const, at: run.startedAt, run }))
      : []),
  ]
    .filter((r) => !source || r.source === source)
    .sort((a, b) => b.at - a.at);
  const offline = flowRuns === "offline" || server === "offline";

  return (
    <section
      className="panel"
      aria-label="Flow runs"
      style={{ padding: 16, display: "grid", gap: 8 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="k">Recent runs</span>
        <select
          className="input"
          aria-label="Source"
          value={source}
          onChange={(e) => setSearch(e.target.value ? `?source=${e.target.value}` : "")}
          style={{ width: "auto" }}
        >
          {SOURCES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={load}>
          Refresh
        </button>
      </div>
      {offline && <span className="muted">Runs need the server.</span>}
      {!offline && flowRuns !== undefined && rows.length === 0 && (
        <span className="muted">No runs yet.</span>
      )}
      {rows.map((r) =>
        r.source === "flow" ? (
          <div key={r.run.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a className="link" href={flowPath(r.run.flowId)}>
                {title(r.run.flowId)}
              </a>
              <ResultChip result={r.run.result} />
              <span className="num muted" style={{ fontSize: 12 }}>
                {when(r.run.startedAt)}
              </span>
            </div>
            <StepList steps={r.run.steps} flowId={r.run.flowId} />
          </div>
        ) : (
          <div
            key={`${r.run.job}:${r.run.startedAt}`}
            style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a className="link" href={jobPath(r.run.job)}>
                {jobLabel(r.run.job)}
              </a>
              <span className="chip" style={{ background: "var(--line)" }}>
                BUILT IN
              </span>
              <span
                className="chip"
                style={{
                  background: "var(--line)",
                  color: r.run.result === "ok" ? "var(--income)" : "var(--expense)",
                }}
              >
                {r.run.result}
              </span>
              <span className="num muted" style={{ fontSize: 12 }}>
                {when(r.run.startedAt)}
              </span>
            </div>
            {r.run.summary && (
              <span className="muted" style={{ fontSize: 13 }}>
                {r.run.summary}
              </span>
            )}
          </div>
        ),
      )}
    </section>
  );
}
