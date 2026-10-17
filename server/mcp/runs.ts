import { localDateTime } from "../../shared/dates.ts";
import { PARTS, PROJECTS } from "../../shared/projects.ts";
import {
  FINISHED,
  parseSteps,
  RUNS,
  type RunStatus,
  type RunStep,
  STEP_LIMITS,
  type StepStatus,
} from "../../shared/runs.ts";
import type { Doc } from "../../shared/types.ts";
import { type AgentWriter, visibleCollectionDoc, type WriteResult } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { Store } from "../store.ts";

const fail = (error: string): WriteResult => ({ ok: false, error });
const live = (d: Doc | undefined): d is Doc => d !== undefined && d.data._deleted !== true;

export interface RunDeps {
  store: Store;
  agent: Agent;
  writer: () => AgentWriter;
  now: () => number;
  timeZone: () => string | undefined;
}

/** `start_run`: a run on a project the agent may see, optionally on one of its parts. */
export function startRun(
  d: RunDeps,
  args: { project: string; title: string; part?: string | undefined },
): WriteResult {
  const project = d.store.get(args.project);
  if (
    !visibleCollectionDoc(d.store, d.agent, PROJECTS) ||
    !live(project) ||
    project.collection !== PROJECTS
  )
    return fail(`project ${args.project} not found`);
  if (args.part !== undefined) {
    const part = d.store.get(args.part);
    if (!live(part) || part.collection !== PARTS || part.data.project !== args.project)
      return fail(`part ${args.part} is not a part of project ${args.project}`);
  }
  const title = args.title.trim().slice(0, STEP_LIMITS.title);
  if (!title) return fail("title is required");
  return d.writer().writeRun(undefined, {
    _title: title,
    project: args.project,
    ...(args.part !== undefined ? { part: args.part } : {}),
    agent: d.agent.name,
    status: "running",
    started_at: localDateTime(new Date(d.now()), d.timeZone()),
    steps: [],
  });
}

/** The run, if this agent started it; anyone else's run is "not found", as with other items. */
function ownRun(d: RunDeps, id: string): { ok: true; run: Doc } | { ok: false; error: string } {
  const run = d.store.get(id);
  if (!live(run) || run.collection !== RUNS || run.data.agent !== d.agent.name)
    return { ok: false, error: `run ${id} not found` };
  if (FINISHED.includes(run.data.status as RunStatus))
    return { ok: false, error: `run ${id} is finished` };
  return { ok: true, run };
}

/** `log_step`: one step appended; the run waits while its newest step waits. */
export function logStep(
  d: RunDeps,
  args: { run: string; title: string; status: StepStatus; detail?: string | undefined },
): WriteResult {
  const own = ownRun(d, args.run);
  if (!own.ok) return own;
  const parsed = parseSteps(own.run.data.steps ?? []);
  const steps = parsed.ok ? parsed.steps : [];
  if (steps.length >= STEP_LIMITS.steps)
    return fail(
      `run ${args.run} has ${STEP_LIMITS.steps} steps already; finish it and start another`,
    );
  const step: RunStep = {
    title: args.title.trim(),
    status: args.status,
    ...(args.detail ? { detail: args.detail } : {}),
    at: new Date(d.now()).toISOString(),
  };
  return d.writer().writeRun(own.run, {
    steps: [...steps, step],
    status: args.status === "waiting" ? "waiting" : "running",
  });
}

/** `finish_run`: the final status and a summary; a finished run takes no more steps. */
export function finishRun(
  d: RunDeps,
  args: { run: string; status: "done" | "failed" | "cancelled"; summary: string },
): WriteResult {
  const own = ownRun(d, args.run);
  if (!own.ok) return own;
  return d.writer().writeRun(own.run, {
    status: args.status,
    finished_at: localDateTime(new Date(d.now()), d.timeZone()),
    _body: args.summary,
  });
}
