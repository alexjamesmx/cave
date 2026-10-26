import { useCallback, useEffect, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { type FlowDefinition, MAX_STEPS, parseDefinition } from "../../../shared/flows/registry.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { newId } from "../../../shared/ids.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { ownerGet, ownerPost } from "../app/owner-api.ts";
import { flowPath, navigate } from "../app/router.ts";
import { addStep, blankFlow, blankPart, copyData, type Selection } from "../logic/flow-edit.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { FlowCanvas } from "../ui/flows/FlowCanvas.tsx";
import { FlowPicker } from "../ui/flows/FlowPicker.tsx";
import { PartEditor } from "../ui/flows/PartEditor.tsx";
import { ApproveButtons } from "../ui/flows/PendingFlows.tsx";
import {
  type FlowRun,
  ResultChip,
  RunHistory,
  type RunLog,
  StepList,
} from "../ui/flows/RunHistory.tsx";
import { Icon } from "../ui/icon.tsx";

const STATUS_COLORS: Record<string, string> = {
  draft: "var(--muted)",
  on: "var(--income)",
  off: "var(--muted)",
  "pending-approval": "var(--gold)",
};
const statusText = (s: unknown) => (s === "pending-approval" ? "pending approval" : String(s));

export function Flows({ id }: { id: string | undefined }) {
  const { local } = useCave();
  const flows = (useItems(local.db, FLOWS) ?? []).filter((d) => d.data._deleted !== true);
  const selected = flows.find((d) => d.id === id) ?? (id ? undefined : flows[0]);

  return (
    <div className="flow-detail">
      <FlowPicker {...(selected ? { flowId: selected.id } : {})} />
      {selected ? (
        <FlowDetail key={selected.id} flow={selected} />
      ) : (
        <p className="muted">{id ? "This flow isn't on this device." : "No flows yet."}</p>
      )}
    </div>
  );
}

function FlowDetail({ flow }: { flow: Doc }) {
  const cave = useCave();
  const { local } = cave;
  const collections = (useCollections(local.db) ?? []).filter(
    (c) => !c.data.hidden && c.id !== "proposals" && c.data._deleted !== true,
  );
  const stored = parseDefinition(flow.data.definition);
  const [draft, setDraft] = useState<FlowDefinition>(() =>
    stored.ok ? stored.value : blankFlow(),
  );
  const [selection, setSelection] = useState<Selection>("trigger");
  const [error, setError] = useState<string>();
  const [test, setTest] = useState<RunLog | { error: string } | "offline" | "running">();
  const [runs, setRuns] = useState<FlowRun[] | "offline">();
  // Parsed on both sides: validation puts keys in schema order, which a raw compare would see.
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(stored.ok ? stored.value : flow.data.definition);
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
  const save = () => {
    const parsed = parseDefinition(draft);
    if (!parsed.ok) return setError(parsed.error);
    void write({ definition: parsed.value });
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

  return (
    <div className="flow-detail">
      <header className="flow-header">
        <input
          className="title-input"
          aria-label="Flow name"
          defaultValue={titleOf(flow)}
          onBlur={(e) => e.target.value !== titleOf(flow) && void write({ _title: e.target.value })}
        />
        <span
          className="chip num"
          style={{ background: "var(--line)", color: STATUS_COLORS[status] ?? "var(--muted)" }}
        >
          {statusText(status).toUpperCase()}
        </span>
        <span className="muted" style={{ fontSize: 13 }}>
          by {String(flow.data.author ?? "owner")}
        </span>
        <div className="flow-actions">
          <button type="button" className="btn" onClick={() => void duplicate()}>
            <Icon name="copy" size={15} /> Duplicate
          </button>
          <button
            type="button"
            className="btn"
            disabled={dirty || test === "running"}
            title={dirty ? "Save first" : undefined}
            onClick={() => void testRun()}
          >
            <Icon name="play" size={15} /> Test run
          </button>
          {dirty && (
            <button type="button" className="btn primary" onClick={save}>
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
              className="btn primary"
              disabled={dirty}
              title={dirty ? "Save first" : undefined}
              onClick={() => turn(true)}
            >
              <Icon name="zap" size={15} /> Turn on
            </button>
          )}
        </div>
      </header>
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
      {typeof flow.data._body === "string" && flow.data._body && (
        <p className="muted" style={{ margin: 0 }}>
          {flow.data._body}
        </p>
      )}
      <div className="flow-workspace">
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              disabled={draft.steps.length >= MAX_STEPS}
              onClick={() => {
                const next = addStep(draft, blankPart("step", "notify", "tasks"));
                setDraft(next);
                setSelection(next.steps.length - 1);
              }}
            >
              <Icon name="plus" size={15} /> Add a step
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              Click a node to edit it; an if stops the flow when its conditions fail.
            </span>
          </div>
          <FlowCanvas def={draft} selected={selection} onSelect={setSelection} />
        </div>
        <aside aria-label="Step settings" className="panel flow-editor">
          <PartEditor
            def={draft}
            selection={selection}
            collections={collections}
            onChange={setDraft}
            onSelect={setSelection}
          />
        </aside>
      </div>
      {test && (
        <section
          className="panel"
          aria-label="Test run"
          style={{ padding: 16, display: "grid", gap: 8 }}
        >
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
    </div>
  );
}
