import { useState } from "react";
import { useCave } from "../app/context.ts";
import { useSignal } from "../app/signal.ts";

const LABELS = {
  idle: ["SYNCED", "var(--income)"],
  syncing: ["SYNCING", "var(--cyan)"],
  offline: ["OFFLINE · SAVED HERE", "var(--gold)"],
  "clock-ahead": ["CLOCK AHEAD", "var(--expense)"],
  error: ["SYNC ERROR", "var(--expense)"],
} as const;

export function SyncBadge() {
  const status = useSignal(useCave().status);
  const [label, color] = LABELS[status.phase];
  const title = status.phase === "error" ? status.message : undefined;
  return (
    <div className="sync num" role="status" title={title}>
      <span className="dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  );
}

const minutes = (ms: number) => Math.round(ms / 60_000);

/** Shown while the server refuses this device's clock; recovery needs the owner's yes. */
export function ClockAheadBanner() {
  const cave = useCave();
  const status = useSignal(cave.status);
  const [busy, setBusy] = useState(false);
  if (status.phase !== "clock-ahead") return null;
  const { serverTime, deviceTime } = status.error;

  const recover = async () => {
    setBusy(true);
    try {
      await cave.recoverClock(serverTime);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel banner" role="alert">
      <span>
        This device's clock is{" "}
        <strong className="num">{minutes(deviceTime - serverTime)} min</strong> ahead of the server,
        so its changes can't sync. Use server time on this device and re-save the changes made with
        the wrong time?
      </span>
      <button type="button" className="btn primary" disabled={busy} onClick={recover}>
        Use server time
      </button>
    </div>
  );
}
