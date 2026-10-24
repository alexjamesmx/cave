import { localDate } from "../../shared/dates.ts";
import {
  answeredQuestions,
  isQuestion,
  openQuestions,
  type ProjectDocs,
  summarize,
} from "../../shared/project-status.ts";
import { PARTS, type PartNode, PROJECTS, partsTree, templatesOf } from "../../shared/projects.ts";
import { RUNS } from "../../shared/runs.ts";
import type { Doc } from "../../shared/types.ts";
import { visibleCollectionDoc } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { Store } from "../store.ts";
import type { ToolOutcome } from "./read.ts";

const LATEST = 20;
const OPEN_TASK = (d: Doc) => d.data.status !== "done" && d.data.status !== "dropped";
const text = (v: unknown) => (typeof v === "string" ? v : "");

const brief = (d: Doc) => ({ id: d.id, title: text(d.data._title), data: d.data });

/** A question as the asking agent reads it back: the owner's answer is the task's body. */
const questionOut = (d: Doc) => ({
  id: d.id,
  question: text(d.data._title).replace(/^Answer: /, ""),
  status: text(d.data.status),
  answer: text(d.data._body) || null,
  askedBy: text(d.data._askedBy),
  run: text(d.data._run) || null,
  asked: text(d.data._created) || null,
  answered: text(d.data.completed) || null,
});

function treeOut(nodes: PartNode[]): unknown[] {
  return nodes.map((n) => ({ ...brief(n.doc), children: treeOut(n.children) }));
}

/**
 * One project as an agent sees it: its data, its status (the same model as the app), its parts
 * as a tree, its open tasks, its questions for the owner with their answers, and per
 * collection the agent may see, how many items point at it with the latest 20. Collections
 * hidden from the agent are left out, as everywhere else; questions the agent asked itself are
 * reported whether or not it may see tasks, since they are part of its run.
 */
export function getProject(store: Store, agent: Agent, id: string, now: number): ToolOutcome {
  const project = store.get(id);
  if (
    !visibleCollectionDoc(store, agent, PROJECTS) ||
    project?.kind !== "item" ||
    project.collection !== PROJECTS ||
    project.data._deleted === true
  )
    return { ok: false, error: `project ${id} not found` };
  const live = (d: Doc) => d.data._deleted !== true;
  const linked = (collection: string) =>
    store.itemsOf(collection).filter((d) => live(d) && d.data.project === id);
  const visible = (c: string) => visibleCollectionDoc(store, agent, c) !== undefined;

  const items: Record<string, { count: number; latest: unknown[] }> = {};
  for (const c of store.collections()) {
    if (c.id === PARTS || !visible(c.id)) continue;
    const docs = linked(c.id);
    if (docs.length === 0) continue;
    const latest = [...docs]
      .sort((a, b) => text(b.data._created).localeCompare(text(a.data._created)))
      .slice(0, LATEST)
      .map(brief);
    items[c.id] = { count: docs.length, latest };
  }

  const tasks = linked("tasks");
  const questions = tasks.filter(
    (t) => isQuestion(t) && (visible("tasks") || t.data._askedBy === agent.name),
  );
  const settings = store.get("settings")?.data;
  const timeZone = typeof settings?.timezone === "string" ? settings.timezone : undefined;
  const docs: ProjectDocs = {
    project,
    parts: linked(PARTS),
    tasks,
    runs: linked(RUNS),
    others: [...linked("notes"), ...linked("ideas")],
  };
  const rule = templatesOf(settings)[text(project.data.template)]?.progress;
  const status = summarize(docs, rule, linked, localDate(new Date(now), timeZone), now);

  return {
    ok: true,
    value: {
      project: brief(project),
      status,
      parts: visible(PARTS) ? treeOut(partsTree(docs.parts)) : [],
      openTasks: visible("tasks")
        ? tasks.filter((t) => OPEN_TASK(t) && !isQuestion(t)).map(brief)
        : [],
      questions: {
        open: openQuestions(questions).map(questionOut),
        answered: answeredQuestions(questions, now).map(questionOut),
      },
      items,
      // Runs of the project's flows arrive with project Activity (M8 part 4).
      runs: [],
    },
  };
}
