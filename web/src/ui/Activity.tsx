import { useState } from "react";
import { type ActivityEntry, isActiveRun } from "../../../shared/runs.ts";

const COLORS: Record<string, string> = {
  running: "var(--cyan)",
  queued: "var(--muted)",
  waiting: "var(--gold)",
  done: "var(--lime)",
  failed: "var(--expense)",
  cancelled: "var(--muted)",
  skipped: "var(--muted)",
};

const time = (ms: number | undefined) =>
  ms === undefined || !ms
    ? ""
    : new Date(ms).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

/** A status as a pill: the word carries it, the colour only echoes it. */
export function StatusPill({ status }: { status: string }) {
  const color = COLORS[status] ?? "var(--muted)";
  return (
    <span className="chip run-pill" style={{ background: `${color}1f`, color }}>
      {status}
    </span>
  );
}

/** A run's steps as a vertical pipeline; the current step of an active run pulses. */
function RunPipeline({ entry }: { entry: ActivityEntry }) {
  const last = entry.steps.length - 1;
  return (
    <ol className="run-pipeline" aria-label={`Steps of ${entry.title}`}>
      {entry.steps.length === 0 && <li className="muted">No steps yet.</li>}
      {entry.steps.map((s, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: steps are only ever appended, so a position never changes meaning
          key={i}
          className={`run-step${isActiveRun(entry) && i === last ? " current" : ""}`}
          style={{ borderColor: COLORS[s.status] ?? "var(--border)" }}
        >
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <StatusPill status={s.status} />
            <strong>{s.title}</strong>
            <span className="num muted" style={{ marginLeft: "auto", fontSize: 12 }}>
              {time(s.at)}
            </span>
          </span>
          {/* Text from agents is shown as text, never as HTML. */}
          {s.detail && <span className="muted run-detail">{s.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Runs newest first (active ones on top); opening one shows its steps. */
export function ActivityList({
  entries,
  label,
  showSource = false,
}: {
  entries: ActivityEntry[];
  label: string;
  showSource?: boolean;
}) {
  const [open, setOpen] = useState<string>();
  return (
    <ul aria-label={label} className="run-list">
      {entries.length === 0 && <li className="muted">No runs yet.</li>}
      {entries.map((e) => (
        <li key={e.id} className="panel run-row">
          <button
            type="button"
            className="run-head"
            aria-expanded={open === e.id}
            onClick={() => setOpen(open === e.id ? undefined : e.id)}
          >
            <StatusPill status={e.status} />
            <strong style={{ flex: 1 }}>{e.title}</strong>
            {showSource && <span className="k">{e.source}</span>}
            <span className="muted" style={{ fontSize: 13 }}>
              {e.by}
            </span>
            <span className="num muted" style={{ fontSize: 12 }}>
              {time(e.startedAt)}
            </span>
          </button>
          {open === e.id && <RunPipeline entry={e} />}
        </li>
      ))}
    </ul>
  );
}
