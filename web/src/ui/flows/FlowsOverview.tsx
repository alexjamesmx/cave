import { useEffect, useState } from "react";
import { parseDefinition, specOf } from "../../../../shared/flows/registry.ts";
import { FLOWS } from "../../../../shared/flows/seed.ts";
import { newId } from "../../../../shared/ids.ts";
import type { Doc } from "../../../../shared/types.ts";
import { useCave } from "../../app/context.ts";
import { ownerGet } from "../../app/owner-api.ts";
import { flowPath, navigate } from "../../app/router.ts";
import { blankFlow } from "../../logic/flow-edit.ts";
import { titleOf } from "../../logic/views.ts";
import { useSystemReport } from "../../pages/settings/shared.tsx";
import { useItems } from "../../store/queries.ts";
import { Icon } from "../icon.tsx";
import { JOB_ABOUT, jobPath, lookOf } from "./look.ts";
import { type FlowRun, ResultChip } from "./RunHistory.tsx";

const STATUS: Record<string, { label: string; color: string }> = {
  on: { label: "On", color: "var(--ok)" },
  off: { label: "Off", color: "var(--muted)" },
  draft: { label: "Draft", color: "var(--muted)" },
  "pending-approval": { label: "Needs approval", color: "var(--warn)" },
};

const ago = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Flows → Flows (M13): every flow as a card (its trigger and steps as a chain of icons, its
 * state, its last run) and New flow; a card opens the flow on its canvas. The server's
 * built-in jobs follow, each opening its read-only card.
 */
export function FlowsOverview() {
  const { local } = useCave();
  const flows = (useItems(local.db, FLOWS) ?? []).filter((d) => d.data._deleted !== true);
  const { server } = useSystemReport();
  const jobs = typeof server === "object" ? server.jobs : [];
  const [runs, setRuns] = useState<(FlowRun & { flowId: string })[]>([]);
  useEffect(() => {
    void ownerGet<{ runs: (FlowRun & { flowId: string })[] }>("/api/flow-runs").then((r) =>
      setRuns(r?.runs ?? []),
    );
  }, []);
  const lastRun = (id: string) => runs.find((r) => r.flowId === id);

  const create = async () => {
    const id = newId();
    await local.write(
      { id, kind: "item", collection: FLOWS },
      { _title: "New flow", status: "draft", definition: blankFlow(), author: "owner" },
    );
    navigate(flowPath(id));
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section aria-label="Your flows" style={{ display: "grid", gap: 10 }}>
        <span className="k">Your flows · {flows.length}</span>
        <div className="flow-cards">
          <button
            type="button"
            className="panel flow-card flow-card-new"
            onClick={() => void create()}
          >
            <Icon name="plus" size={22} />
            <span>New flow</span>
          </button>
          {flows.map((f) => (
            <FlowCard key={f.id} flow={f} run={lastRun(f.id)} />
          ))}
        </div>
      </section>
      {jobs.length > 0 && (
        <section aria-label="Built in" style={{ display: "grid", gap: 10 }}>
          <span className="k">Built in · runs on its own</span>
          <div className="flow-cards">
            {jobs.map((j) => (
              <a key={j.id} className="panel flow-card" href={jobPath(j.id)}>
                <span className="flow-card-title">
                  <Icon name="cog" size={15} color="var(--warn)" /> {j.label}
                </span>
                <span className="muted flow-card-text">{JOB_ABOUT[j.id] ?? "Built in"}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FlowCard({ flow, run }: { flow: Doc; run: (FlowRun & { flowId: string }) | undefined }) {
  const parsed = parseDefinition(flow.data.definition);
  const status = STATUS[String(flow.data.status ?? "draft")] ?? STATUS.draft;
  const chain = parsed.ok
    ? [
        { kind: "trigger" as const, type: parsed.value.trigger.type },
        ...parsed.value.steps.map((s) => ({ kind: "step" as const, type: s.type })),
      ]
    : [];
  const trigger = parsed.ok
    ? specOf("trigger", parsed.value.trigger.type)?.describe(
        parsed.value.trigger as unknown as Record<string, unknown>,
      )
    : "Definition needs fixing";
  return (
    <a className="panel flow-card" href={flowPath(flow.id)}>
      <span className="flow-card-title">{titleOf(flow)}</span>
      <span className="flow-chain" aria-hidden="true">
        {chain.map((p, i) => {
          const look = lookOf(p.type);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a part is its place in the chain
            <span key={`${p.kind}-${i}`} className="flow-chain-part">
              {i > 0 && <span className="flow-chain-line" aria-hidden="true" />}
              <span className="ico" style={{ background: "var(--on)", color: look.color }}>
                <Icon name={look.icon} size={14} />
              </span>
            </span>
          );
        })}
      </span>
      <span className="muted flow-card-text">{trigger}</span>
      <span className="flow-card-foot">
        <span className="chip" style={{ background: "var(--on)", color: status?.color }}>
          {status?.label}
        </span>
        {run ? (
          <span className="muted num" style={{ fontSize: 12, marginLeft: "auto" }}>
            <ResultChip result={run.result} /> {ago(run.startedAt)}
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
            Never ran
          </span>
        )}
      </span>
    </a>
  );
}
