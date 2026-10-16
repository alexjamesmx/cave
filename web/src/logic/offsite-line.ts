import type { OffsiteStatus } from "../../../server/offsite-status.ts";

/** Settings' and /system's two lines about the off-box copies; `time` formats an ISO time. */
export function offsiteLines(
  s: OffsiteStatus | null,
  time: (iso: string) => string,
): { backup: string; check: string } {
  if (!s) return { backup: "Not set up", check: "Not set up" };
  const b = s.backup;
  const c = s.check;
  const lastOk = b && !b.ok && b.lastOkAt ? ` · last ok ${time(b.lastOkAt)}` : "";
  return {
    backup: !b
      ? "None yet"
      : b.ok
        ? `Snapshot ${b.snapshot} · ${b.docs ?? "?"} docs · ${time(b.at)}`
        : `Failed: ${b.error} · ${time(b.at)}${lastOk}`,
    check: !c
      ? "None yet"
      : c.ok
        ? `Passed · ${c.docs ?? "?"} docs restored · ${time(c.at)}`
        : `Failed: ${c.error} · ${time(c.at)}`,
  };
}
