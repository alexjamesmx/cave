import { FlowPicker } from "../ui/flows/FlowPicker.tsx";
import { Icon } from "../ui/icon.tsx";
import { Offline, useSystemReport, when } from "./settings/shared.tsx";

/** One line on what each built-in job does; the schedule comes from the server. */
const ABOUT: Record<string, string> = {
  reminders: "Sends each reminder's notification when it is due, once per due date.",
  payments: "Tells you before a payment is due and on the day, once per due date.",
  budget: "Checks the month's spending against your limit and tells you at 80 % and 100 %.",
  digest: "One email a day with what needs you, what is due, payments and the budget.",
  flows: "Runs every flow that is on when its schedule or its trigger says so.",
  telegram: "Listens for your messages and button taps in the Telegram chat.",
  backups:
    "Takes a full copy of the database when the newest is more than a day old, checked hourly.",
  offsite: "Checks the off-box copy and reports its last result.",
};

/**
 * A built-in job's card (M12 part 4): what it does, its schedule, its last and next run.
 * Nothing here is editable; the job's runs are under Flows → Runs.
 */
export function FlowJob({ id }: { id: string | undefined }) {
  const { server } = useSystemReport();
  const job = typeof server === "object" ? server.jobs.find((j) => j.id === id) : undefined;
  return (
    <div className="flow-detail">
      <FlowPicker {...(id ? { jobId: id } : {})} />
      {server === "offline" && <Offline what="Built-in jobs" />}
      {server === undefined && <span className="muted">Checking…</span>}
      {typeof server === "object" && !job && <p className="muted">No such job.</p>}
      {job && (
        <section
          className="panel"
          aria-label={job.label}
          style={{ padding: 18, display: "grid", gap: 10, maxWidth: 640 }}
        >
          <header style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Icon name="cog" size={18} color="var(--warn)" />
            <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>{job.label}</h2>
            <span className="chip" style={{ background: "var(--line)" }}>
              BUILT IN
            </span>
          </header>
          <p style={{ margin: 0 }}>{ABOUT[job.id] ?? "A job the server runs on its own."}</p>
          <dl className="job-facts">
            <dt>Schedule</dt>
            <dd>{job.schedule}</dd>
            <dt>Last run</dt>
            <dd>
              {job.lastRun === undefined
                ? "nothing recorded yet"
                : `${when(job.lastRun)}${job.lastResult ? ` · ${job.lastResult}` : ""}${
                    job.lastSummary ? ` · ${job.lastSummary}` : ""
                  }`}
            </dd>
            <dt>Next run</dt>
            <dd>{when(job.nextRun)}</dd>
          </dl>
          <span className="muted" style={{ fontSize: 13 }}>
            Built in: nothing to edit here. Its runs are under{" "}
            <a className="link" href={`/flows/runs?source=job`}>
              Runs
            </a>
            ; its settings live in the server's environment (`docs/hosting.md`).
          </span>
        </section>
      )}
    </div>
  );
}
