import { useActivity } from "../app/activity.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { ActivityList } from "../ui/Activity.tsx";

const SOURCES = ["agent", "flow", "job"] as const;
const STATUSES = ["running", "waiting", "done", "failed", "cancelled", "skipped"] as const;

/** Projects → Activity: every run, agents', flows' and jobs', filterable by source and status. */
export function ActivityPage() {
  const { entries, server } = useActivity();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const source = params.get("source") ?? "";
  const status = params.get("status") ?? "";
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    const q = next.toString();
    setSearch(q ? `?${q}` : "");
  };
  const shown = entries
    .filter((e) => !source || e.source === source)
    .filter((e) => !status || e.status === status);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          className="input"
          aria-label="Source"
          value={source}
          onChange={(e) => filter("source", e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Every source</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Status"
          value={status}
          onChange={(e) => filter("status", e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {!server && (
        <p className="muted" style={{ margin: 0 }}>
          Offline: agents' runs only; flows and jobs show when the server answers.
        </p>
      )}
      <ActivityList entries={shown} label="All runs" showSource />
    </div>
  );
}
