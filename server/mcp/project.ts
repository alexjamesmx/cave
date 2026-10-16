import { PARTS, type PartNode, PROJECTS, partsTree } from "../../shared/projects.ts";
import type { Doc } from "../../shared/types.ts";
import { visibleCollectionDoc } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { Store } from "../store.ts";
import type { ToolOutcome } from "./read.ts";

const LATEST = 20;
const OPEN_TASK = (d: Doc) => d.data.status !== "done" && d.data.status !== "dropped";
const text = (v: unknown) => (typeof v === "string" ? v : "");

const brief = (d: Doc) => ({ id: d.id, title: text(d.data._title), data: d.data });

function treeOut(nodes: PartNode[]): unknown[] {
  return nodes.map((n) => ({ ...brief(n.doc), children: treeOut(n.children) }));
}

/**
 * One project as an agent sees it: its data, its parts as a tree, its open tasks and, per
 * collection the agent may see, how many items point at it with the latest 20. Collections
 * hidden from the agent are left out, as everywhere else.
 */
export function getProject(store: Store, agent: Agent, id: string): ToolOutcome {
  const project = store.get(id);
  if (
    !visibleCollectionDoc(store, agent, PROJECTS) ||
    project?.kind !== "item" ||
    project.collection !== PROJECTS ||
    project.data._deleted === true
  )
    return { ok: false, error: `project ${id} not found` };
  const linked = (collection: string) =>
    store.itemsOf(collection).filter((d) => d.data.project === id);
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
  return {
    ok: true,
    value: {
      project: brief(project),
      parts: visible(PARTS) ? treeOut(partsTree(linked(PARTS))) : [],
      openTasks: visible("tasks") ? linked("tasks").filter(OPEN_TASK).map(brief) : [],
      items,
      // Runs of the project's flows arrive with project Activity (M8 part 4).
      runs: [],
    },
  };
}
