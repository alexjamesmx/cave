import { parseDefinition } from "../../../shared/flows/registry.ts";
import { nextSlot } from "../../../shared/flows/schedule.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone } from "../app/hooks.ts";
import { flowPath } from "../app/router.ts";
import { titleOf } from "../logic/views.ts";
import { useItems } from "../store/queries.ts";
import { ApproveButtons } from "../ui/flows/PendingFlows.tsx";
import { Offline, Panel, Row, useSystemReport, when } from "./settings/shared.tsx";

/** Flows → List: every flow with its status, author, last run and next slot. */
export function FlowList() {
  const { db } = useCave().local;
  const flows = useItems(db, FLOWS) ?? [];
  const zone = useReminderZone();
  const now = useNow().getTime();
  const { server } = useSystemReport();
  const runs = new Map(typeof server === "object" ? server.flowRuns.map((r) => [r.flowId, r]) : []);
  const next = (flow: Doc) => {
    const parsed = parseDefinition(flow.data.definition);
    if (flow.data.status !== "on" || !parsed.ok || parsed.value.trigger.type !== "schedule")
      return undefined;
    return nextSlot(parsed.value.trigger, now, zone.timeZone);
  };
  return (
    <Panel title="Flows">
      {server === "offline" && <Offline what="Last runs" />}
      {flows.map((f) => {
        const run = runs.get(f.id);
        const n = next(f);
        return (
          <Row key={f.id}>
            <a className="link" href={flowPath(f.id)}>
              {titleOf(f)}
            </a>
            <span className="chip" style={{ background: "var(--on)" }}>
              {String(f.data.status)}
            </span>
            <span className="muted">by {String(f.data.author ?? "owner")}</span>
            <span className="muted">
              {run ? `last ${when(run.lastAt)} · ${run.result}` : "never run"}
            </span>
            <span className="muted">{n ? `next ${when(n)}` : ""}</span>
            {f.data.status === "pending-approval" && (
              <span style={{ display: "flex", gap: 8 }}>
                <ApproveButtons flow={f} />
              </span>
            )}
          </Row>
        );
      })}
    </Panel>
  );
}
