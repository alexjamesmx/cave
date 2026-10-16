import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import type { Change, Doc } from "../../../shared/types.ts";
import { undoPatch } from "../../../shared/undo.ts";
import { useCave } from "../app/context.ts";
import { useTimeZone } from "../app/hooks.ts";
import { ownerGet } from "../app/owner-api.ts";
import { undoChange } from "../app/undo.ts";
import { titleOf } from "../logic/views.ts";
import { useDoc, useItems } from "../store/queries.ts";
import { PendingFlows } from "../ui/flows/PendingFlows.tsx";

interface AgentInfo {
  name: string;
  scopes: string[];
  collections: string[] | null;
  revoked: number | null;
  lastCall: number | null;
}

interface ActivityEntry {
  seq: number;
  agent: string;
  tool: string;
  args: string;
  at: number;
  ok: boolean;
  error: string | null;
  changes: Change[];
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function Agents() {
  const [agents, setAgents] = useState<AgentInfo[] | "offline">();
  const [activity, setActivity] = useState<ActivityEntry[] | "offline">();
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      ownerGet<{ agents: AgentInfo[] }>("/api/agents"),
      ownerGet<{ entries: ActivityEntry[] }>("/api/activity?limit=50"),
    ]);
    setAgents(a?.agents ?? "offline");
    setActivity(b?.entries ?? "offline");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Agents work through <span className="num">/mcp</span> with their own tokens. Nothing is
          hard-deleted, and every agent change is logged and can be undone.
        </p>
      </header>
      <PendingFlows />
      <Proposals />
      <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <span className="k">Agents</span>
        {agents === "offline" && <Offline />}
        {Array.isArray(agents) && agents.length === 0 && (
          <span className="muted">
            No agents yet. Add one with <span className="num">bun run agent add</span>.
          </span>
        )}
        {Array.isArray(agents) &&
          agents.map((a) => (
            <div key={a.name} className="entry" style={{ cursor: "default" }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{a.name}</span>
              <span className="chip" style={{ background: "#11141a" }}>
                {a.scopes.join(" · ")}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {a.collections ? a.collections.join(", ") : "all collections"}
              </span>
              <span className="num muted" style={{ fontSize: 12 }}>
                {a.revoked ? "revoked" : a.lastCall ? `last ${when(a.lastCall)}` : "never used"}
              </span>
            </div>
          ))}
      </section>
      <section className="panel" style={{ padding: 16, display: "grid", gap: 6 }}>
        <span className="k">Activity</span>
        {activity === "offline" && <Offline />}
        {Array.isArray(activity) && activity.length === 0 && (
          <span className="muted">No agent calls yet.</span>
        )}
        {Array.isArray(activity) && activity.map((e) => <ActivityRow key={e.seq} entry={e} />)}
      </section>
    </>
  );
}

const Offline = () => <span className="muted">The agent list and activity need the server.</span>;

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "8px 0", display: "grid", gap: 4 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600 }}>{entry.agent}</span>
        <span className="num">{entry.tool}</span>
        {!entry.ok && <span className="error">{entry.error}</span>}
        <span className="num muted" style={{ marginLeft: "auto", fontSize: 12 }}>
          {when(entry.at)}
        </span>
      </div>
      {entry.changes.map((change) => (
        <ChangeRow key={change.seq} change={change} />
      ))}
    </div>
  );
}

/** One write by an agent, with Undo computed from this device's copy of the doc. */
function ChangeRow({ change }: { change: Change }) {
  const cave = useCave();
  const { local } = cave;
  const doc = useDoc(local.db, change.id);
  // A preview from this device's copy; the Undo button syncs and plans again before writing.
  const plan = useMemo(() => undoPatch(change, doc), [change, doc]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const restorable = Object.keys(plan.patch);
  // Keys that share a reason are listed together: "status, area: changed since".
  const byReason = new Map<string, string[]>();
  for (const { key, reason } of plan.skipped)
    byReason.set(reason, [...(byReason.get(reason) ?? []), key]);
  const reason = [...byReason]
    .map(([why, keys]) => (keys.length === change.keys.length ? why : `${keys.join(", ")}: ${why}`))
    .join("; ");

  const undo = async () => {
    setBusy(true);
    try {
      const result = await undoChange(change, local, cave.syncAndWait);
      setError(result.ok ? undefined : result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, paddingLeft: 12 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        {doc ? titleOf(doc) : change.id} <span className="muted">· {change.keys.join(", ")}</span>
        {reason && (
          <span className="muted" style={{ display: "block" }}>
            {restorable.length > 0 ? `Undo keeps ${reason}` : `Can't undo: ${reason}`}
          </span>
        )}
        {error && (
          <span role="alert" className="error" style={{ display: "block" }}>
            {error}
          </span>
        )}
      </span>
      <button
        type="button"
        className="btn"
        disabled={busy || restorable.length === 0}
        onClick={undo}
      >
        Undo
      </button>
    </div>
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
    <section className="panel" style={{ padding: 16, display: "grid", gap: 6 }}>
      <span className="k">Proposals</span>
      {sorted.length === 0 && <span className="muted">No proposals from agents.</span>}
      {sorted.map((p) => (
        <ProposalRow key={p.id} proposal={p} decide={decide} />
      ))}
    </section>
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
        <span className="chip" style={{ background: "#11141a" }}>
          {String(proposal.data.status)}
        </span>
      )}
    </div>
  );
}
