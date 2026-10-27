import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { type FlowDefinition, MAX_STEPS, parseDefinition } from "../../../shared/flows/registry.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { newId } from "../../../shared/ids.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { ownerGet, ownerPost } from "../app/owner-api.ts";
import { flowPath, navigate } from "../app/router.ts";
import { type BoardFlow, boardGraph, groupFlows } from "../logic/flow-board.ts";
import {
  addStep,
  blankFlow,
  blankPart,
  copyData,
  type Selection,
  triggerCollection,
} from "../logic/flow-edit.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { FlowBoard, statusOf } from "../ui/flows/FlowBoard.tsx";
import { JOB_ABOUT, jobPath } from "../ui/flows/look.ts";
import { PartEditor } from "../ui/flows/PartEditor.tsx";
import { ApproveButtons } from "../ui/flows/PendingFlows.tsx";
import {
  type FlowRun,
  ResultChip,
  RunHistory,
  type RunLog,
  StepList,
} from "../ui/flows/RunHistory.tsx";
import { StepPicker } from "../ui/flows/StepPicker.tsx";
import { Icon } from "../ui/icon.tsx";
import { Offline, useSystemReport, when } from "./settings/shared.tsx";

/** The open flow's unsaved definition and which of its parts the inspector shows. */
interface Editing {
  flow: string | undefined;
  draft: FlowDefinition | undefined;
  part: Selection;
  adding: boolean;
}

const fresh = (flow: string | undefined, part: Selection = "trigger"): Editing => ({
  flow,
  draft: undefined,
  part,
  adding: false,
});

/**
 * Flows → Flows (after M13): every flow and built-in job on one canvas, grouped by what starts them,
 * with an inspector beside it. `/flows/<id>` opens a flow in the inspector and
 * `/flows/jobs/<id>` a built-in job; edits show on the canvas until saved.
 */
export function Flows({ rest }: { rest: string[] }) {
  const { local } = useCave();
  const flows = (useItems(local.db, FLOWS) ?? []).filter((d) => d.data._deleted !== true);
  const collections = useCollections(local.db);
  const { server } = useSystemReport();
  const jobs = typeof server === "object" ? server.jobs : [];
  const [runs, setRuns] = useState<(FlowRun & { flowId: string })[]>([]);
  useEffect(() => {
    void ownerGet<{ runs: (FlowRun & { flowId: string })[] }>("/api/flow-runs").then((r) =>
      setRuns(r?.runs ?? []),
    );
  }, []);

  const jobId = rest[0] === "jobs" ? rest[1] : undefined;
  const flowId = rest[0] === "jobs" ? undefined : rest[0];
  const open = flows.find((d) => d.id === flowId);
  const [editing, setEditing] = useState<Editing>(() => fresh(flowId));
  // Another flow opened (a link, Back): its stored definition, its trigger selected.
  if (editing.flow !== flowId) setEditing(fresh(flowId));
  const stored = open ? parseDefinition(open.data.definition) : undefined;
  // A stored definition that does not validate opens as a blank one, unsaved.
  const draft = editing.draft ?? (stored?.ok ? stored.value : blankFlow());
  const dirty = editing.draft !== undefined || stored?.ok === false;

  const boardFlows: BoardFlow[] = useMemo(
    () =>
      flows.map((f) => {
        const parsed = parseDefinition(f.data.definition);
        const run = runs.find((r) => r.flowId === f.id);
        return {
          id: f.id,
          title: titleOf(f),
          status: String(f.data.status ?? "draft"),
          def: parsed.ok ? parsed.value : undefined,
          ...(run ? { lastRun: { result: run.result, at: run.startedAt } } : {}),
        };
      }),
    [flows, runs],
  );
  const name = useCallback(
    (id: string) => String(collections?.find((c) => c.id === id)?.data.name ?? id),
    [collections],
  );
  const openId = open?.id;
  const graph = useMemo(
    () =>
      boardGraph({
        groups: groupFlows(boardFlows, name),
        jobs,
        selection: jobId
          ? { job: jobId }
          : openId
            ? { flow: openId, part: editing.part, adding: editing.adding }
            : undefined,
        draft: openId ? draft : undefined,
        canAdd: draft.steps.length < MAX_STEPS,
      }),
    [boardFlows, name, jobs, jobId, openId, editing.part, editing.adding, draft],
  );

  const leave = () => !dirty || confirm("Leave this flow without saving your changes?");
  const select = (target: { flow: string; part?: Selection } | { job: string }) => {
    if ("job" in target) {
      if (leave()) navigate(jobPath(target.job));
      return;
    }
    if (target.flow === flowId) {
      setEditing((e) => ({ ...e, part: target.part ?? e.part, adding: false }));
      return;
    }
    if (!leave()) return;
    setEditing(fresh(target.flow, target.part));
    navigate(flowPath(target.flow));
  };
  const create = async () => {
    if (!leave()) return;
    const id = newId();
    await local.write(
      { id, kind: "item", collection: FLOWS },
      { _title: "New flow", status: "draft", definition: blankFlow(), author: "owner" },
    );
    navigate(flowPath(id));
  };
  const on = flows.filter((f) => f.data.status === "on").length;

  return (
    <div className={`flows-board${flowId || jobId ? " inspecting" : ""}`}>
      <FlowBoard
        nodes={graph.nodes}
        edges={graph.edges}
        onSelect={select}
        onAdd={() => setEditing((e) => ({ ...e, adding: true }))}
        toolbar={
          <>
            <button type="button" className="btn primary" onClick={() => void create()}>
              <Icon name="plus" size={15} /> New flow
            </button>
            <span className="muted flow-board-count">
              {flows.length} flow{flows.length === 1 ? "" : "s"} · {on} on
            </span>
          </>
        }
      />
      {open && (
        <FlowInspector
          key={open.id}
          flow={open}
          draft={draft}
          dirty={dirty}
          part={editing.part}
          adding={editing.adding}
          onDraft={(next) => setEditing((e) => ({ ...e, draft: next }))}
          onPart={(part) => setEditing((e) => ({ ...e, part, adding: false }))}
          onAdding={(adding) => setEditing((e) => ({ ...e, adding }))}
          onSaved={() => setEditing((e) => ({ ...e, draft: undefined }))}
          onClose={() => leave() && navigate(flowPath())}
        />
      )}
      {flowId && !open && (
        <aside className="panel flow-inspector" aria-label="Flow settings">
          <InspectorHead title="Flow" onClose={() => navigate(flowPath())} />
          <p className="muted">This flow isn't on this device.</p>
        </aside>
      )}
      {jobId && (
        <aside className="panel flow-inspector" aria-label="System job">
          <JobPanel id={jobId} />
        </aside>
      )}
    </div>
  );
}

function InspectorHead({ title, onClose }: { title: string; onClose(): void }) {
  return (
    <header className="inspector-head">
      <span className="k" style={{ flex: 1 }}>
        {title}
      </span>
      <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose}>
        <Icon name="x" size={15} />
      </button>
    </header>
  );
}

function FlowInspector({
  flow,
  draft,
  dirty,
  part,
  adding,
  onDraft,
  onPart,
  onAdding,
  onSaved,
  onClose,
}: {
  flow: Doc;
  draft: FlowDefinition;
  dirty: boolean;
  part: Selection;
  adding: boolean;
  onDraft(def: FlowDefinition): void;
  onPart(part: Selection): void;
  onAdding(adding: boolean): void;
  onSaved(): void;
  onClose(): void;
}) {
  const cave = useCave();
  const { local } = cave;
  const collections = (useCollections(local.db) ?? []).filter(
    (c) => !c.data.hidden && c.id !== "proposals" && c.data._deleted !== true,
  );
  const stored = parseDefinition(flow.data.definition);
  const [error, setError] = useState<string>();
  const [test, setTest] = useState<RunLog | { error: string } | "offline" | "running">();
  const [runs, setRuns] = useState<FlowRun[] | "offline">();
  const status = String(flow.data.status ?? "draft");
  const asked = new URLSearchParams(location.search).get("do");

  const loadRuns = useCallback(async () => {
    const answer = await ownerGet<{ runs: FlowRun[] }>(`/api/flows/${flow.id}/runs`);
    setRuns(answer?.runs ?? "offline");
  }, [flow.id]);
  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const write = async (patch: Record<string, unknown>) => {
    try {
      await local.write({ id: flow.id, kind: "item", collection: FLOWS }, patch);
      setError(undefined);
      return true;
    } catch (e) {
      if (!(e instanceof FieldValueError)) throw e;
      setError(e.message);
      return false;
    }
  };
  const save = async () => {
    const parsed = parseDefinition(draft);
    if (!parsed.ok) return setError(parsed.error);
    if (await write({ definition: parsed.value })) onSaved();
  };
  // Turning on checks the stored definition again: an older device may have written it.
  const turn = (on: boolean) => {
    if (on && !stored.ok) return setError(stored.error);
    void write({ status: on ? "on" : "off" });
  };
  const testRun = async () => {
    setTest("running");
    // The server tests what it holds, so this device's edits go first.
    await cave.syncAndWait();
    const result = await ownerPost<RunLog | { error: string }>(`/api/flows/${flow.id}/test`, {});
    setTest(result ?? "offline");
  };
  const duplicate = async () => {
    const copyId = newId();
    await local.write({ id: copyId, kind: "item", collection: FLOWS }, copyData(flow.data));
    navigate(flowPath(copyId));
  };
  // Marked deleted like any item: it stops running, leaves the canvas, and can be restored.
  const remove = async () => {
    if (!confirm(`Delete “${titleOf(flow)}”? It stays in the history and can be restored.`)) return;
    if (await write({ _deleted: true })) navigate(flowPath());
  };
  const look = statusOf(status);

  return (
    <aside className="panel flow-inspector" aria-label="Flow settings">
      <header className="inspector-head">
        <input
          className="input title-input"
          aria-label="Flow name"
          defaultValue={titleOf(flow)}
          onBlur={(e) => e.target.value !== titleOf(flow) && void write({ _title: e.target.value })}
        />
        <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </header>
      <div className="inspector-meta">
        <span className="flow-status" style={{ "--tone": look.color } as CSSProperties}>
          <span className="flow-status-dot" />
          {status === "pending-approval" ? "PENDING APPROVAL" : status.toUpperCase()}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          by {String(flow.data.author ?? "owner")}
        </span>
      </div>
      {typeof flow.data._body === "string" && flow.data._body && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {flow.data._body}
        </p>
      )}
      <div className="flow-actions">
        {dirty && (
          <button type="button" className="btn primary" onClick={() => void save()}>
            Save
          </button>
        )}
        {status === "pending-approval" ? (
          <ApproveButtons flow={flow} />
        ) : status === "on" ? (
          <button type="button" className="btn" onClick={() => turn(false)}>
            Turn off
          </button>
        ) : (
          <button
            type="button"
            className={`btn${dirty ? "" : " primary"}`}
            disabled={dirty}
            title={dirty ? "Save first" : undefined}
            onClick={() => turn(true)}
          >
            <Icon name="zap" size={15} /> Turn on
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={dirty || test === "running"}
          title={dirty ? "Save first" : undefined}
          onClick={() => void testRun()}
        >
          <Icon name="play" size={15} /> Test run
        </button>
        <button type="button" className="btn" onClick={() => void duplicate()}>
          <Icon name="copy" size={15} /> Duplicate
        </button>
        <button type="button" className="btn" onClick={() => void remove()}>
          <Icon name="trash" size={15} /> Delete
        </button>
      </div>
      {asked && status === "pending-approval" && (
        <div className="banner" role="status">
          {asked === "approve" ? "Approve" : "Reject"} this flow? Check its steps, then use the
          buttons above.
        </div>
      )}
      {(error || !stored.ok) && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error ?? (stored.ok ? "" : `Stored definition is not valid: ${stored.error}`)}
        </p>
      )}
      <aside aria-label="Step settings" className="flow-editor">
        {adding ? (
          <StepPicker
            onCancel={() => onAdding(false)}
            onPick={(type) => {
              const collection = triggerCollection(draft) ?? "tasks";
              const next = addStep(draft, blankPart("step", type, collection));
              onDraft(next);
              onPart(next.steps.length - 1);
            }}
          />
        ) : (
          <PartEditor
            def={draft}
            selection={part}
            collections={collections}
            onChange={onDraft}
            onSelect={onPart}
          />
        )}
      </aside>
      {test && (
        <section aria-label="Test run" className="inspector-block">
          <span className="k">Test run · writes and sends nothing</span>
          {test === "running" && <span className="muted">Running…</span>}
          {test === "offline" && <span className="muted">A test run needs the server.</span>}
          {typeof test === "object" && "error" in test && (
            <span className="error">{test.error}</span>
          )}
          {typeof test === "object" && "steps" in test && (
            <>
              <ResultChip result={test.result} />
              <StepList steps={test.steps} />
            </>
          )}
        </section>
      )}
      <RunHistory runs={runs} flowId={flow.id} onRefresh={() => void loadRuns()} />
    </aside>
  );
}

/** A built-in job (M12 part 4): what it does, its schedule, its last and next run. */
function JobPanel({ id }: { id: string }) {
  const { server } = useSystemReport();
  const job = typeof server === "object" ? server.jobs.find((j) => j.id === id) : undefined;
  return (
    <>
      <InspectorHead title="System · keeps the Cave running" onClose={() => navigate(flowPath())} />
      {server === "offline" && <Offline what="System jobs" />}
      {server === undefined && <span className="muted">Checking…</span>}
      {typeof server === "object" && !job && <p className="muted">No such job.</p>}
      {job && (
        <section aria-label={job.label} style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="cog" size={18} color="var(--warn)" /> {job.label}
          </h2>
          <p style={{ margin: 0 }}>{JOB_ABOUT[job.id] ?? "A job the server runs on its own."}</p>
          <dl className="job-facts">
            <dt>Schedule</dt>
            <dd>{job.schedule}</dd>
            <dt>Last run</dt>
            <dd>
              {job.lastRun === undefined
                ? "nothing recorded yet"
                : `${when(job.lastRun)}${job.lastResult ? ` · ${job.lastResult}` : ""}${
                    job.lastSummary ? ` · ${job.lastSummary}` : ""
                  }`}
            </dd>
            <dt>Next run</dt>
            <dd>{when(job.nextRun)}</dd>
          </dl>
          <span className="muted" style={{ fontSize: 13 }}>
            Nothing to edit here. Its runs are under{" "}
            <a className="link" href="/flows/runs?source=job">
              Runs
            </a>
            ; its settings live in the server's environment.
          </span>
        </section>
      )}
    </>
  );
}
