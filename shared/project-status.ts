import { parseStamp } from "./hlc.ts";
import { partProgress, progressBy } from "./projects.ts";
import type { Doc } from "./types.ts";

/**
 * The status model (M11 part 4): what the Scene, the All list, the project header and
 * `get_project` say about a project, from stored docs alone. Pure functions; the caller passes
 * the project's own docs and the clock.
 */

export type ProjectState =
  | "done"
  | "dropped"
  | "paused"
  | "blocked"
  | "waiting"
  | "slipping"
  | "on-track";

export const STATE_LABEL: Record<ProjectState, string> = {
  done: "done",
  dropped: "dropped",
  paused: "paused",
  blocked: "blocked",
  waiting: "waiting on you",
  slipping: "slipping",
  "on-track": "on track",
};

/** The CSS token each state is drawn in. */
export const STATE_TOKEN: Record<ProjectState, string> = {
  done: "--muted",
  dropped: "--muted",
  paused: "--muted",
  blocked: "--bad",
  waiting: "--wait",
  slipping: "--warn",
  "on-track": "--ok",
};

/** Progress may lag the elapsed share of the schedule by this much before it counts as slipping. */
export const SLIP_MARGIN = 0.15;
const DAY = 24 * 60 * 60 * 1000;
export const ACTIVITY_DAYS = 7;
export const AGENT_RECENT_MS = DAY;
export const ANSWERED_DAYS = 30;

const CLOSED = new Set(["done", "dropped"]);
const text = (v: unknown) => (typeof v === "string" ? v : "");
export const isLive = (d: Doc) => d.data._deleted !== true;
export const isOpen = (d: Doc) => isLive(d) && !CLOSED.has(text(d.data.status));

/** A task an agent asked through `log_step(question: true)`; the owner answers in its body. */
export const isQuestion = (t: Doc) => typeof t.data._askedBy === "string";

/** The newest stamp on a doc, as a time. */
export function lastStamp(doc: Doc): number {
  let latest = 0;
  for (const stamp of Object.values(doc.stamps)) {
    const { ms } = parseStamp(stamp);
    if (ms > latest) latest = ms;
  }
  return latest;
}

/** The project's docs the model reads. Each list holds only that project's items. */
export interface ProjectDocs {
  project: Doc;
  parts: Doc[];
  tasks: Doc[];
  runs: Doc[];
  /** Notes, ideas and other linked items; they count towards activity only. */
  others?: Doc[];
}

/** `due`, `review` and the like hold a local date, with or without a time. */
const day = (v: unknown) => text(v).slice(0, 10);

/**
 * Slipping by time: parts done over parts total is more than `SLIP_MARGIN` below the share of
 * the schedule that has elapsed, between the project's creation (or its first part's) and its
 * latest part due date. Without a due date there is no schedule to slip against.
 */
function behindSchedule(d: ProjectDocs, now: number): boolean {
  const live = d.parts.filter(isLive);
  const dues = live.map((p) => day(p.data.due)).filter(Boolean);
  if (dues.length === 0) return false;
  const starts = [text(d.project.data._created), ...live.map((p) => text(p.data._created))]
    .filter(Boolean)
    .map((iso) => Date.parse(iso))
    .filter((ms) => !Number.isNaN(ms));
  if (starts.length === 0) return false;
  const start = Math.min(...starts);
  const end = Date.parse(`${dues.sort().at(-1)}T23:59:59Z`);
  if (Number.isNaN(end) || end <= start) return false;
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const { done, total } = partProgress(live);
  if (total === 0) return false;
  return done / total < elapsed - SLIP_MARGIN;
}

/** The first rule that matches; `today` is the owner's local date, `now` the clock. */
export function stateOf(d: ProjectDocs, today: string, now: number): ProjectState {
  const own = text(d.project.data.status);
  if (own === "done" || own === "dropped" || own === "paused") return own;
  const parts = d.parts.filter(isLive);
  if (parts.some((p) => p.data.status === "blocked")) return "blocked";
  if (d.tasks.some((t) => isOpen(t) && isQuestion(t))) return "waiting";
  const review = day(d.project.data.review);
  if (review && review < today) return "slipping";
  if (
    parts.some(
      (p) => !CLOSED.has(text(p.data.status)) && day(p.data.due) && day(p.data.due) < today,
    )
  )
    return "slipping";
  if (behindSchedule(d, now)) return "slipping";
  return "on-track";
}

export interface Progress {
  done: number;
  total: number;
  /** What is counted: a collection id, "parts" or "tasks". */
  of: string;
}

/** A template's own progress rule, as `settings.projectTemplates` stores it. */
export type ProgressRule = { collection: string; field: string; done: string[] } | undefined;

/**
 * The template's rule when it names one, else parts done over live parts, else tasks done
 * over tasks; nothing when there is nothing to count.
 */
export function progressOf(
  d: ProjectDocs,
  rule: ProgressRule,
  itemsOf: (collection: string) => Doc[],
): Progress | undefined {
  if (rule) {
    const by = progressBy(itemsOf(rule.collection), rule.field, rule.done);
    return { done: by.done, total: by.total, of: rule.collection };
  }
  const parts = partProgress(d.parts);
  if (parts.total > 0) return { ...parts, of: "parts" };
  const tasks = d.tasks.filter((t) => isLive(t) && t.data.status !== "dropped" && !isQuestion(t));
  if (tasks.length > 0)
    return {
      done: tasks.filter((t) => t.data.status === "done").length,
      total: tasks.length,
      of: "tasks",
    };
  return undefined;
}

/** How many of the project's docs changed in the last 7 days, on any device. */
export function activityThisWeek(d: ProjectDocs, now: number): number {
  const since = now - ACTIVITY_DAYS * DAY;
  return [...d.parts, ...d.tasks, ...d.runs, ...(d.others ?? [])].filter(
    (doc) => lastStamp(doc) >= since,
  ).length;
}

/** A run of the project is running and started within the last day (by its start stamp). */
export function agentOnIt(runs: Doc[], now: number): boolean {
  return runs.some((r) => {
    if (!isLive(r) || r.data.status !== "running") return false;
    const stamp = r.stamps.started_at ?? r.stamps.status;
    return stamp !== undefined && parseStamp(stamp).ms >= now - AGENT_RECENT_MS;
  });
}

/** Open questions for the owner: tasks an agent asked that are not done or dropped. */
export const openQuestions = (tasks: Doc[]) => tasks.filter((t) => isOpen(t) && isQuestion(t));

/** Questions answered (done) within the last 30 days, by the stamp of the answer. */
export const answeredQuestions = (tasks: Doc[], now: number) =>
  tasks.filter(
    (t) =>
      isLive(t) &&
      isQuestion(t) &&
      t.data.status === "done" &&
      (t.stamps.status === undefined ||
        parseStamp(t.stamps.status).ms >= now - ANSWERED_DAYS * DAY),
  );

export interface ProjectSummary {
  state: ProjectState;
  progress: Progress | undefined;
  activity: number;
  agentOnIt: boolean;
  questions: number;
}

export function summarize(
  d: ProjectDocs,
  rule: ProgressRule,
  itemsOf: (collection: string) => Doc[],
  today: string,
  now: number,
): ProjectSummary {
  return {
    state: stateOf(d, today, now),
    progress: progressOf(d, rule, itemsOf),
    activity: activityThisWeek(d, now),
    agentOnIt: agentOnIt(d.runs, now),
    questions: openQuestions(d.tasks).length,
  };
}

/** "72% · on track · agent working", as the Scene and the All list print it. */
export function summaryLine(s: ProjectSummary): string {
  const parts: string[] = [];
  if (s.progress && s.progress.total > 0)
    parts.push(`${Math.round((s.progress.done / s.progress.total) * 100)}%`);
  parts.push(STATE_LABEL[s.state]);
  if (s.agentOnIt) parts.push("agent working");
  if (s.questions > 0) parts.push(`${s.questions} question${s.questions === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
