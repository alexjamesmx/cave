import { useEffect, useMemo, useState } from "react";
import type { Change } from "../../../../shared/types.ts";
import { undoPatch } from "../../../../shared/undo.ts";
import { useCave } from "../../app/context.ts";
import { ownerGet } from "../../app/owner-api.ts";
import { undoChange } from "../../app/undo.ts";
import { titleOf } from "../../logic/views.ts";
import { useDoc } from "../../store/queries.ts";
import { Offline, Panel, when } from "./shared.tsx";

/** `GET /api/activity`: one agent call and the writes it made. */
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

/** The last 50 agent calls, each write with Undo computed from this device's copy. */
export function UndoHistory() {
  const [activity, setActivity] = useState<ActivityEntry[] | "offline">();
  useEffect(() => {
    void ownerGet<{ entries: ActivityEntry[] }>("/api/activity?limit=50").then((b) =>
      setActivity(b?.entries ?? "offline"),
    );
  }, []);
  return (
    <Panel title="Undo history">
      <span className="muted" style={{ fontSize: 13 }}>
        What agents wrote, newest first. Undo puts the value back unless it changed since.
      </span>
      {activity === "offline" && <Offline what="Agents' writes" />}
      {Array.isArray(activity) && activity.length === 0 && (
        <span className="muted">No agent calls yet.</span>
      )}
      {Array.isArray(activity) && activity.map((e) => <ActivityRow key={e.seq} entry={e} />)}
    </Panel>
  );
}

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
