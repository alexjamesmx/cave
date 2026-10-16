import { useState } from "react";
import type { Change } from "../../../../shared/types.ts";
import { useCave } from "../../app/context.ts";
import { ownerGet } from "../../app/owner-api.ts";
import { collectionPath } from "../../app/router.ts";
import { undoChange } from "../../app/undo.ts";
import { titleOf } from "../../logic/views.ts";
import { useDoc } from "../../store/queries.ts";

export interface StepLog {
  step: number;
  type: string;
  outcome: string;
  ids?: string[];
}
export interface RunLog {
  result: "ok" | "stopped" | "failed" | "missed" | "running";
  steps: StepLog[];
}
export interface FlowRun extends RunLog {
  key: string;
  startedAt: number;
}

const COLORS: Record<RunLog["result"], string> = {
  ok: "var(--income)",
  stopped: "var(--muted)",
  failed: "var(--expense)",
  missed: "var(--gold)",
  running: "var(--cyan)",
};

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ResultChip({ result }: { result: RunLog["result"] }) {
  return (
    <span className="chip" style={{ background: "#11141a", color: COLORS[result] }}>
      {result}
    </span>
  );
}

/**
 * Each step's outcome. An item a run wrote links to its collection while it exists, with
 * Undo for the flow's change to it.
 */
export function StepList({ steps, flowId }: { steps: StepLog[]; flowId?: string }) {
  return (
    <ol className="flow-steps-log">
      {steps.map((s) => (
        <li key={`${s.step}-${s.type}`}>
          <span className="num muted">{s.step + 1}</span> {s.outcome}
          {s.ids?.map((id) => (
            <WrittenItem key={id} id={id} flowId={flowId} />
          ))}
        </li>
      ))}
    </ol>
  );
}

function WrittenItem({ id, flowId }: { id: string; flowId: string | undefined }) {
  const cave = useCave();
  const doc = useDoc(cave.local.db, id);
  const [note, setNote] = useState<string>();
  if (!doc?.collection || doc.data._deleted === true)
    return <span className="muted"> · {doc ? "undone" : "not on this device yet"}</span>;
  const undo = async () => {
    const history = await ownerGet<{ changes: Change[] }>(`/api/history/${encodeURIComponent(id)}`);
    const change = history?.changes.find((c) => c.actor === `flow:${flowId}`);
    if (!change) return setNote(history ? "nothing to undo" : "undo needs the server");
    const result = await undoChange(change, cave.local, cave.syncAndWait);
    if (!result.ok) return setNote(result.error);
    const skipped = result.plan.skipped.map((k) => `${k.key}: ${k.reason}`).join("; ");
    setNote(skipped || undefined);
  };
  return (
    <>
      {" · "}
      <a className="link" href={collectionPath(doc.collection)}>
        {titleOf(doc)}
      </a>
      {flowId && (
        <>
          {" "}
          <button type="button" className="link" onClick={() => void undo()}>
            Undo
          </button>
        </>
      )}
      {note && <span className="muted"> · {note}</span>}
    </>
  );
}

export function RunHistory({
  runs,
  flowId,
  onRefresh,
}: {
  runs: FlowRun[] | "offline" | undefined;
  flowId: string;
  onRefresh(): void;
}) {
  return (
    <section
      className="panel"
      aria-label="Run history"
      style={{ padding: 16, display: "grid", gap: 8 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="k">Run history</span>
        <button type="button" className="btn" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {runs === "offline" && <span className="muted">Run history needs the server.</span>}
      {Array.isArray(runs) && runs.length === 0 && <span className="muted">No runs yet.</span>}
      {Array.isArray(runs) &&
        runs.map((r) => (
          <div key={r.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <ResultChip result={r.result} />
              <span className="num muted" style={{ fontSize: 12 }}>
                {when(r.startedAt)}
              </span>
            </div>
            <StepList steps={r.steps} flowId={flowId} />
          </div>
        ))}
    </section>
  );
}
