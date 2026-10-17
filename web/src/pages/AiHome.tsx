import { AI, AI_KINDS } from "../../../shared/ai.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { useActivity } from "../app/activity.ts";
import { useCave } from "../app/context.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { useItems } from "../store/queries.ts";
import { ActivityList } from "../ui/Activity.tsx";

/**
 * AI → Overview: counts of the setup for now; the map of surfaces, connections, Cave tools and
 * automations comes with M8 part 5.
 */
export function AiOverview() {
  const { db } = useCave().local;
  const items = (useItems(db, AI) ?? []).filter((d) => d.data._deleted !== true);
  const flows = (useItems(db, FLOWS) ?? []).filter((d) => d.data._deleted !== true);
  const count = (kind: string) => items.filter((d) => d.data.kind === kind).length;
  return (
    <section
      className="panel"
      aria-label="AI setup"
      style={{ padding: 16, display: "grid", gap: 10 }}
    >
      <span className="k">The whole setup</span>
      <div className="stats">
        {AI_KINDS.map((k) => (
          <a
            key={k}
            className="panel stat"
            href={`/ai/setup?kind=${k}`}
            style={{ textDecoration: "none", color: "var(--text)" }}
          >
            <span className="k">{k}</span>
            <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>
              {count(k)}
            </span>
          </a>
        ))}
        <a
          className="panel stat"
          href="/ai/flows"
          style={{ textDecoration: "none", color: "var(--text)" }}
        >
          <span className="k">flows on</span>
          <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>
            {flows.filter((f) => f.data.status === "on").length}
          </span>
        </a>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>
        The map of how it all connects comes in M8 part 5.
      </span>
    </section>
  );
}

const SOURCES = ["agent", "flow", "job"] as const;
const STATUSES = ["running", "waiting", "done", "failed", "cancelled", "skipped"] as const;

/** AI → Activity: every run, agents', flows' and jobs', filterable by source and status. */
export function AiActivity() {
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
