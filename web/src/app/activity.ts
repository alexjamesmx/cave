import { useEffect, useMemo, useState } from "react";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { dueInstant } from "../../../shared/recurrence.ts";
import {
  type ActivityEntry,
  flowRunEntry,
  isActiveRun,
  jobRunEntry,
  RUNS,
  runEntry,
} from "../../../shared/runs.ts";
import { useItems } from "../store/queries.ts";
import { useCave } from "./context.ts";
import { useReminderZone } from "./hooks.ts";
import { ownerGet } from "./owner-api.ts";

type FlowRunRow = Parameters<typeof flowRunEntry>[0];
type JobRunRow = Parameters<typeof jobRunEntry>[0];

/** Active first, then newest first. */
const order = (a: ActivityEntry, b: ActivityEntry) =>
  Number(isActiveRun(b)) - Number(isActiveRun(a)) || b.startedAt - a.startedAt;

/**
 * Agents' runs from this device's copy (live, and offline too), merged with flow and job runs
 * that only the server knows (when it answers). `project` keeps only that project's runs.
 */
export function useActivity(project?: string): {
  entries: ActivityEntry[];
  /** False while offline: flows and jobs are missing, agents' runs are not. */
  server: boolean;
} {
  const { db } = useCave().local;
  const runs = useItems(db, RUNS);
  const flows = useItems(db, FLOWS);
  const zone = useReminderZone();
  const [remote, setRemote] = useState<{ flows: FlowRunRow[]; jobs: JobRunRow[] }>();
  const [server, setServer] = useState(true);

  useEffect(() => {
    if (project) return;
    let stop = false;
    const load = async () => {
      const [f, s] = await Promise.all([
        ownerGet<{ runs: FlowRunRow[] }>("/api/flow-runs"),
        ownerGet<{ jobRuns: JobRunRow[] }>("/api/system"),
      ]);
      if (stop) return;
      setServer(f !== undefined && s !== undefined);
      setRemote({ flows: f?.runs ?? [], jobs: s?.jobRuns ?? [] });
    };
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [project]);

  const entries = useMemo(() => {
    const local = (runs ?? [])
      .filter((d) => !project || d.data.project === project)
      .map((d) => runEntry(d, (local) => dueInstant(local, zone)));
    const title = (id: string) => {
      const flow = flows?.find((f) => f.id === id);
      return typeof flow?.data._title === "string" ? flow.data._title : "Flow";
    };
    const others = project
      ? []
      : [
          ...(remote?.flows ?? []).map((r) => flowRunEntry(r, title(r.flowId))),
          ...(remote?.jobs ?? []).map(jobRunEntry),
        ];
    return [...local, ...others].sort(order);
  }, [runs, flows, remote, project, zone]);
  return { entries, server: project ? true : server };
}
