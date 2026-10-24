import { useCallback, useEffect, useState } from "react";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { useCave } from "../app/context.ts";
import { ownerGet } from "../app/owner-api.ts";
import { flowPath } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { type FlowRun, ResultChip, StepList } from "../ui/flows/RunHistory.tsx";

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Flows → Runs: the newest runs across every flow, each step's outcome, Undo on what they wrote. */
export function FlowRuns() {
  const { db } = useCave().local;
  const flows = useItems(db, FLOWS) ?? [];
  const [runs, setRuns] = useState<(FlowRun & { flowId: string })[] | "offline">();
  const load = useCallback(() => {
    void ownerGet<{ runs: (FlowRun & { flowId: string })[] }>("/api/flow-runs").then((r) =>
      setRuns(r?.runs ?? "offline"),
    );
  }, []);
  useEffect(load, [load]);
  const title = (id: string) => {
    const flow = flows.find((f) => f.id === id);
    return flow ? titleOf(flow) : id;
  };
  return (
    <section
      className="panel"
      aria-label="Flow runs"
      style={{ padding: 16, display: "grid", gap: 8 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="k">Recent runs</span>
        <button type="button" className="btn" onClick={load}>
          Refresh
        </button>
      </div>
      {runs === "offline" && <span className="muted">Runs need the server.</span>}
      {Array.isArray(runs) && runs.length === 0 && <span className="muted">No runs yet.</span>}
      {Array.isArray(runs) &&
        runs.map((r) => (
          <div key={r.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a className="link" href={flowPath(r.flowId)}>
                {title(r.flowId)}
              </a>
              <ResultChip result={r.result} />
              <span className="num muted" style={{ fontSize: 12 }}>
                {when(r.startedAt)}
              </span>
            </div>
            <StepList steps={r.steps} flowId={r.flowId} />
          </div>
        ))}
    </section>
  );
}
