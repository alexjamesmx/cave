import { PARTS, PROJECTS } from "./projects.ts";
import type { CollectionData, Field, SelectOption } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * Runs (M8 part 4): the trace of AI work, like an n8n execution. An agent starts a run on a
 * project, logs a step per meaningful action and finishes it; devices sync runs like any item,
 * so Activity works offline and updates live. The collection is hidden: only the run tools
 * write it, and an agent only touches runs it started.
 */

export const RUNS = "runs";
export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting",
  "done",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const FINISHED: readonly RunStatus[] = ["done", "failed", "cancelled"];
export const STEP_STATUSES = ["running", "done", "failed", "waiting", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const STEP_LIMITS = { steps: 200, title: 200, detail: 2000 } as const;

export interface RunStep {
  title: string;
  status: StepStatus;
  detail?: string;
  /** ISO 8601, UTC. */
  at: string;
}

const opt = (value: string, icon: string, color: string): SelectOption => ({ value, icon, color });

const STEPS_FIELD: Field = {
  id: "steps",
  name: "Steps",
  type: "json",
  config: { schema: "steps" },
};

export const RUNS_COLLECTION: CollectionData = {
  name: "Runs",
  icon: "activity",
  color: "#3DE0FF",
  order: 11,
  hidden: true,
  fields: [
    { id: "project", name: "Project", type: "ref", config: { collection: PROJECTS } },
    { id: "part", name: "Part", type: "ref", config: { collection: PARTS } },
    { id: "agent", name: "Agent", type: "text" },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        opt("queued", "clock", "#8C93A0"),
        opt("running", "loader", "#3DE0FF"),
        opt("waiting", "hourglass", "#F5C451"),
        opt("done", "circle-check", "#B6FF3B"),
        opt("failed", "circle-x", "#FF5C7A"),
        opt("cancelled", "ban", "#8C93A0"),
      ],
    },
    { id: "started_at", name: "Started", type: "date", config: { withTime: true } },
    { id: "finished_at", name: "Finished", type: "date", config: { withTime: true } },
    STEPS_FIELD,
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const TAG = /<\s*\/?\s*[a-z!?]/i;

/** A run's steps: at most 200, plain text, each with a known status and a time. */
export function parseSteps(
  value: unknown,
): { ok: true; steps: RunStep[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: "must be a list of steps" };
  if (value.length > STEP_LIMITS.steps)
    return { ok: false, error: `has more than ${STEP_LIMITS.steps} steps` };
  for (const [i, s] of value.entries()) {
    const at = `step ${i + 1}`;
    if (!isRecord(s)) return { ok: false, error: `${at} must be an object` };
    if (typeof s.title !== "string" || !s.title.trim() || s.title.length > STEP_LIMITS.title)
      return { ok: false, error: `${at} needs a title up to ${STEP_LIMITS.title} characters` };
    if (!STEP_STATUSES.includes(s.status as StepStatus))
      return { ok: false, error: `${at} status must be one of: ${STEP_STATUSES.join(", ")}` };
    if (
      s.detail !== undefined &&
      (typeof s.detail !== "string" || s.detail.length > STEP_LIMITS.detail)
    )
      return {
        ok: false,
        error: `${at} detail must be text up to ${STEP_LIMITS.detail} characters`,
      };
    if (typeof s.at !== "string" || Number.isNaN(Date.parse(s.at)))
      return { ok: false, error: `${at} needs an ISO time` };
    for (const text of [s.title, s.detail])
      if (typeof text === "string" && TAG.test(text))
        return { ok: false, error: `${at} must be plain text, not HTML` };
  }
  return { ok: true, steps: value as RunStep[] };
}

/** Seed migration 13: the runs collection, when the database has none. */
export function runsMigration(
  get: (id: string) => Doc | undefined,
): { id: string; kind: "collection"; data: Record<string, unknown> }[] {
  return get(RUNS) ? [] : [{ id: RUNS, kind: "collection", data: RUNS_COLLECTION }];
}

/** One line in an Activity list, whatever ran it: an agent's run, a flow or a job. */
export interface ActivityEntry {
  id: string;
  source: "agent" | "flow" | "job";
  title: string;
  /** The agent's name, the flow's title or the job's label. */
  by: string;
  status: "running" | "waiting" | "done" | "failed" | "cancelled" | "queued" | "skipped";
  startedAt: number;
  finishedAt?: number;
  project?: string;
  part?: string;
  steps: { title: string; status: string; detail?: string; at?: number }[];
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** An agent run as an Activity entry; local times are read in the settings timezone's sense. */
export function runEntry(
  doc: Doc,
  toInstant: (local: string) => number | undefined,
): ActivityEntry {
  const steps = parseSteps(doc.data.steps);
  const started = toInstant(text(doc.data.started_at));
  const finished = toInstant(text(doc.data.finished_at));
  const status = RUN_STATUSES.includes(doc.data.status as RunStatus)
    ? (doc.data.status as RunStatus)
    : "queued";
  return {
    id: doc.id,
    source: "agent",
    title: text(doc.data._title) || "Run",
    by: text(doc.data.agent) || "agent",
    status,
    startedAt: started ?? 0,
    ...(finished !== undefined ? { finishedAt: finished } : {}),
    ...(text(doc.data.project) ? { project: text(doc.data.project) } : {}),
    ...(text(doc.data.part) ? { part: text(doc.data.part) } : {}),
    steps: steps.ok
      ? steps.steps.map((s) => ({
          title: s.title,
          status: s.status,
          ...(s.detail ? { detail: s.detail } : {}),
          at: Date.parse(s.at),
        }))
      : [],
  };
}

/** A flow run from the server's `flow_runs`, as an Activity entry. */
export function flowRunEntry(
  run: {
    key: string;
    flowId: string;
    startedAt: number;
    result: string;
    steps: { step: number; type: string; outcome: string }[];
  },
  flowTitle: string,
): ActivityEntry {
  const status =
    run.result === "ok"
      ? "done"
      : run.result === "failed"
        ? "failed"
        : run.result === "missed"
          ? "skipped"
          : "cancelled";
  return {
    id: `flow:${run.key}`,
    source: "flow",
    title: flowTitle,
    by: flowTitle,
    status,
    startedAt: run.startedAt,
    steps: run.steps.map((s) => ({
      title: `${s.step}. ${s.type}`,
      status: "done",
      detail: s.outcome,
    })),
  };
}

/** A job run from the server's `job_runs`, as an Activity entry. */
export function jobRunEntry(run: {
  job: string;
  startedAt: number;
  finishedAt: number;
  result: string;
  summary: string;
}): ActivityEntry {
  return {
    id: `job:${run.job}:${run.startedAt}`,
    source: "job",
    title: run.job,
    by: run.job,
    status: run.result === "ok" ? "done" : "failed",
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    steps: [{ title: run.summary || run.result, status: run.result === "ok" ? "done" : "failed" }],
  };
}

/** Active runs glow on the Map and show first. */
export const isActiveRun = (e: Pick<ActivityEntry, "status">) =>
  e.status === "running" || e.status === "waiting" || e.status === "queued";
