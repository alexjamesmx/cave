import { AI, AI_KINDS } from "../../../shared/ai.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { useCave } from "../app/context.ts";
import { useItems } from "../store/queries.ts";

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

/** AI → Activity: until runs exist (M8 part 4), where each kind of activity is today. */
export function AiActivity() {
  return (
    <section className="panel" style={{ padding: 16, display: "grid", gap: 8 }}>
      <span className="k">Activity</span>
      <span className="muted">
        Every run in one place (agents', flows' and jobs') comes in M8 part 4. Until then:
      </span>
      <a className="link" href="/ai/agents">
        Agents: every call, with Undo
      </a>
      <a className="link" href="/ai/flows">
        Flows: each flow's run history
      </a>
      <a className="link" href="/settings/system/jobs">
        Jobs: the server's runs
      </a>
    </section>
  );
}
