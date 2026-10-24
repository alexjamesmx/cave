import { useState } from "react";
import { FieldValueError } from "../../../../shared/fields.ts";
import type { Doc } from "../../../../shared/types.ts";
import { useCave } from "../../app/context.ts";
import { type ImportPlan, parseExport, planImport } from "../../logic/import-plan.ts";
import { Panel } from "./shared.tsx";

type State =
  | { step: "pick" }
  | { step: "planned"; name: string; plan: ImportPlan }
  | { step: "importing"; done: number; total: number }
  | { step: "done"; written: number; refused: string[] }
  | { step: "error"; error: string };

/**
 * An export back in, through this device's write path: the file is read and compared with this
 * device's copy first (a dry run), then each differing key is written as an edit from here, so
 * it validates, syncs and can be undone like any change. Nothing is removed.
 */
export function Import() {
  const { local } = useCave();
  const [state, setState] = useState<State>({ step: "pick" });

  const pick = async (file: File) => {
    const parsed = parseExport(await file.text());
    if (!parsed.ok) return setState({ step: "error", error: parsed.error });
    const mine = new Map<string, Doc>((await local.db.docs.toArray()).map((d) => [d.id, d]));
    setState({ step: "planned", name: file.name, plan: planImport(parsed.file.docs, mine) });
  };

  const run = async (plan: ImportPlan) => {
    const refused: string[] = [];
    let written = 0;
    for (const [i, w] of plan.writes.entries()) {
      setState({ step: "importing", done: i, total: plan.writes.length });
      try {
        await local.write(w.target, w.patch);
        written += 1;
      } catch (e) {
        if (!(e instanceof FieldValueError)) throw e;
        refused.push(`${w.target.id}: ${e.message}`);
      }
    }
    setState({ step: "done", written, refused });
  };

  return (
    <Panel title="Import">
      <span className="muted" style={{ fontSize: 13 }}>
        An export file back in. It is compared with this device first; only values that differ are
        written, as edits from this device, so they sync and can be undone. Nothing is removed.
      </span>
      {state.step === "pick" && (
        <label className="btn" style={{ justifySelf: "start" }}>
          Choose an export file…
          <input
            type="file"
            accept="application/json,.json"
            className="sr"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pick(file);
            }}
          />
        </label>
      )}
      {state.step === "planned" && (
        <>
          <span>
            <span className="num">{state.name}</span>:{" "}
            {state.plan.writes.filter((w) => w.isNew).length} new,{" "}
            {state.plan.writes.filter((w) => !w.isNew).length} changed, {state.plan.unchanged}{" "}
            unchanged.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={state.plan.writes.length === 0}
              onClick={() => void run(state.plan)}
            >
              Import {state.plan.writes.length} docs
            </button>
            <button type="button" className="btn" onClick={() => setState({ step: "pick" })}>
              Cancel
            </button>
          </div>
        </>
      )}
      {state.step === "importing" && (
        <span role="status" className="num">
          Writing {state.done} of {state.total}…
        </span>
      )}
      {state.step === "done" && (
        <>
          <span role="status">
            Imported {state.written} docs
            {state.refused.length > 0 ? `; ${state.refused.length} refused:` : "."}
          </span>
          {state.refused.map((r) => (
            <span key={r} className="error" style={{ fontSize: 13 }}>
              {r}
            </span>
          ))}
          <button
            type="button"
            className="btn"
            style={{ justifySelf: "start" }}
            onClick={() => setState({ step: "pick" })}
          >
            Import another
          </button>
        </>
      )}
      {state.step === "error" && (
        <>
          <span role="alert" className="error">
            {state.error}
          </span>
          <button
            type="button"
            className="btn"
            style={{ justifySelf: "start" }}
            onClick={() => setState({ step: "pick" })}
          >
            Try another file
          </button>
        </>
      )}
    </Panel>
  );
}
