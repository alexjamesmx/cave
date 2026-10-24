import { useEffect, useState } from "react";
import { localDateTime } from "../../../../shared/dates.ts";
import { FLOWS } from "../../../../shared/flows/seed.ts";
import type { Doc } from "../../../../shared/types.ts";
import { useCave } from "../../app/context.ts";
import { useTimeZone } from "../../app/hooks.ts";
import { ownerGet } from "../../app/owner-api.ts";
import { titleOf } from "../../logic/views.ts";
import { useDoc, useItems } from "../../store/queries.ts";
import { PendingFlows } from "../../ui/flows/PendingFlows.tsx";
import { Offline, Panel, Row, useSystemReport, when } from "./shared.tsx";

/** `GET /api/agents`: each token's permissions. */
interface AgentInfo {
  name: string;
  scopes: string[];
  collections: string[] | null;
  revoked: number | null;
  lastCall: number | null;
}

/**
 * Settings → Agents: everything about agents except their runs (Projects → Activity): flows
 * waiting for approval, delete proposals, and each agent's token, permissions and use.
 */
export function SettingsAgents() {
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Agents work through <span className="num">/mcp</span> with their own tokens. Nothing is
        hard-deleted; every agent change is logged and can be undone under Settings → Data.
      </p>
      <PendingFlows />
      <Proposals />
      <AgentList />
    </>
  );
}

function AgentList() {
  const { db } = useCave().local;
  const flows = useItems(db, FLOWS) ?? [];
  const [agents, setAgents] = useState<AgentInfo[] | "offline">();
  const { server } = useSystemReport();
  useEffect(() => {
    void ownerGet<{ agents: AgentInfo[] }>("/api/agents").then((a) =>
      setAgents(a?.agents ?? "offline"),
    );
  }, []);
  const use = new Map(typeof server === "object" ? server.agents.map((a) => [a.name, a]) : []);
  return (
    <Panel title="Agents">
      {agents === "offline" && <Offline what="Agents" />}
      {Array.isArray(agents) && agents.length === 0 && (
        <span className="muted">
          No agents yet. Add one with <span className="num">bun run agent add</span>.
        </span>
      )}
      {Array.isArray(agents) &&
        agents.map((a) => {
          const u = use.get(a.name);
          return (
            <Row key={a.name}>
              <strong>{a.name}</strong>
              <span className="chip" style={{ background: "var(--on)" }}>
                {a.revoked ? "revoked" : a.scopes.join(" · ")}
              </span>
              <span className="muted">
                {a.collections ? a.collections.join(", ") : "all collections"}
              </span>
              <span className="num muted">
                {a.lastCall ? `last ${when(a.lastCall)}` : "never used"}
              </span>
              {u && (
                <span className="num">
                  {u.calls7d} calls in 7 days · {u.created} items ·{" "}
                  {flows.filter((f) => f.data.author === a.name).length} flows
                </span>
              )}
            </Row>
          );
        })}
    </Panel>
  );
}

/** Delete proposals from agents. Decisions are local writes, so they work offline. */
function Proposals() {
  const { local } = useCave();
  const timeZone = useTimeZone();
  const proposals = useItems(local.db, "proposals") ?? [];
  const sorted = [...proposals].sort((a, b) => {
    const pending = Number(b.data.status === "pending") - Number(a.data.status === "pending");
    return pending || String(b.data._created).localeCompare(String(a.data._created));
  });

  const decide = async (proposal: Doc, target: Doc | undefined, approve: boolean) => {
    if (approve && target) {
      await local.write(
        { id: target.id, kind: target.kind, collection: target.collection },
        { _deleted: true },
      );
    }
    await local.write(
      { id: proposal.id, kind: "item", collection: "proposals" },
      {
        status: approve ? "approved" : "declined",
        decided: localDateTime(new Date(), timeZone),
      },
    );
  };

  return (
    <Panel title="Proposals">
      {sorted.length === 0 && <span className="muted">No proposals from agents.</span>}
      {sorted.map((p) => (
        <ProposalRow key={p.id} proposal={p} decide={decide} />
      ))}
    </Panel>
  );
}

function ProposalRow({
  proposal,
  decide,
}: {
  proposal: Doc;
  decide(proposal: Doc, target: Doc | undefined, approve: boolean): Promise<void>;
}) {
  const { local } = useCave();
  const target = useDoc(local.db, String(proposal.data.target ?? ""));
  const pending = proposal.data.status === "pending";
  return (
    <div className="entry" style={{ cursor: "default", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 200 }}>
        Delete <strong>{target ? titleOf(target) : String(proposal.data.target)}</strong>
        <span className="muted">
          {" "}
          · {target?.collection ?? "unknown"} · {String(proposal.data.agent)}:{" "}
          {String(proposal.data.reason)}
        </span>
      </span>
      {pending ? (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => void decide(proposal, target, false)}
          >
            Decline
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!target}
            onClick={() => void decide(proposal, target, true)}
          >
            Approve
          </button>
        </>
      ) : (
        <span className="chip" style={{ background: "var(--on)" }}>
          {String(proposal.data.status)}
        </span>
      )}
    </div>
  );
}
