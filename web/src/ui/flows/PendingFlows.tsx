import { describeFlow } from "../../../../shared/flows/describe.ts";
import { parseDefinition } from "../../../../shared/flows/registry.ts";
import { FLOWS } from "../../../../shared/flows/seed.ts";
import type { Doc } from "../../../../shared/types.ts";
import { useCave } from "../../app/context.ts";
import { flowPath } from "../../app/router.ts";
import { titleOf } from "../../logic/views.ts";
import { useItems } from "../../store/queries.ts";

/**
 * Approve turns a flow on and Reject turns it off: the owner's local writes, so they work
 * offline. An invalid definition can't be approved.
 */
export function ApproveButtons({ flow }: { flow: Doc }) {
  const { local } = useCave();
  const valid = parseDefinition(flow.data.definition).ok;
  const decide = (approve: boolean) =>
    void local.write(
      { id: flow.id, kind: "item", collection: FLOWS },
      { status: approve ? "on" : "off" },
    );
  return (
    <>
      <button type="button" className="btn" onClick={() => decide(false)}>
        Reject
      </button>
      <button
        type="button"
        className="btn primary"
        disabled={!valid}
        title={valid ? undefined : "The definition is not valid"}
        onClick={() => decide(true)}
      >
        Approve
      </button>
    </>
  );
}

/** Flows agents saved with a sensitive step, for the Agents page. */
export function PendingFlows() {
  const { local } = useCave();
  const pending = (useItems(local.db, FLOWS) ?? []).filter(
    (d) => d.data.status === "pending-approval" && d.data._deleted !== true,
  );
  return (
    <section className="panel" style={{ padding: 16, display: "grid", gap: 6 }}>
      <span className="k">Flows waiting for approval</span>
      {pending.length === 0 && <span className="muted">No flows waiting.</span>}
      {pending.map((flow) => {
        const parsed = parseDefinition(flow.data.definition);
        return (
          <div key={flow.id} className="entry" style={{ cursor: "default", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 200 }}>
              <a className="link" href={flowPath(flow.id)}>
                {titleOf(flow)}
              </a>
              <span className="muted">
                {" "}
                · {String(flow.data.author ?? "unknown")}
                {parsed.ok
                  ? ` · ${describeFlow(parsed.value).join(" → ")}`
                  : " · invalid definition"}
              </span>
            </span>
            <ApproveButtons flow={flow} />
          </div>
        );
      })}
    </section>
  );
}
