import type { Edge, Node } from "@xyflow/react";
import type { FlowDefinition } from "../../../shared/flows/registry.ts";
import type { Selection } from "./flow-edit.ts";
import { COLUMN, type FlowNode, flowGraph, selectionOf } from "./flow-graph.ts";

/**
 * Every flow on one canvas (after M13), the way n8n draws a workspace: flows grouped by what starts
 * them (each collection they watch, the schedule), one lane per flow with its card on the
 * left and its trigger and steps to the right, and the server's built-in jobs as a group of
 * their own. Each lane is `flowGraph`'s drawing of that flow, moved into place.
 */

export interface BoardFlow {
  id: string;
  title: string;
  status: string;
  /** Undefined when the stored definition does not validate. */
  def: FlowDefinition | undefined;
  lastRun?: { result: string; at: number };
}

export interface BoardJob {
  id: string;
  label: string;
  schedule: string;
  lastResult?: string;
}

/** What the inspector shows: one flow (and one of its parts), or one built-in job. */
export type BoardSelection =
  | { flow: string; part: Selection; adding: boolean }
  | { job: string }
  | undefined;

/** Type aliases, not interfaces: React Flow's node data needs an index signature. */
export type GroupData = { label: string; count: number; tone: string };
export type FlowCardData = {
  flowId: string;
  title: string;
  status: string;
  lastRun?: { result: string; at: number };
  selected: boolean;
};
export type JobData = {
  jobId: string;
  label: string;
  schedule: string;
  lastResult?: string;
  selected: boolean;
};

export type BoardNode =
  | FlowNode
  | Node<GroupData, "group">
  | Node<FlowCardData, "flow">
  | Node<JobData, "job">;

const PAD = 28;
const HEAD = 52;
const LANE = 118;
const ELSE_ROW = 100;
const GAP = 48;
const JOB_COLUMNS = 4;
const JOB_ROW = 104;

export const GROUP_PREFIX = "group:";
export const JOB_PREFIX = "job:";
const SEP = "/";

export const laneId = (flow: string, part: string) => `${flow}${SEP}${part}`;

/** What a click on a node selects; frames and stop nodes select nothing. */
export function boardTarget(
  id: string,
): { flow: string; part?: Selection } | { job: string } | undefined {
  if (id.startsWith(GROUP_PREFIX)) return undefined;
  if (id.startsWith(JOB_PREFIX)) return { job: id.slice(JOB_PREFIX.length) };
  const at = id.indexOf(SEP);
  if (at < 0) return undefined;
  const flow = id.slice(0, at);
  const part = id.slice(at + 1);
  if (part === "card") return { flow };
  const selection = selectionOf(part);
  return selection === undefined ? undefined : { flow, part: selection };
}

export interface FlowGroup {
  key: string;
  label: string;
  tone: string;
  flows: BoardFlow[];
}

/**
 * The groups, in a steady order: the schedule first, then each watched collection by name,
 * then the flows whose definition needs fixing.
 */
export function groupFlows(
  flows: BoardFlow[],
  collectionName: (id: string) => string,
): FlowGroup[] {
  const groups = new Map<string, FlowGroup>();
  const add = (key: string, label: string, tone: string, flow: BoardFlow) => {
    const group = groups.get(key) ?? { key, label, tone, flows: [] };
    group.flows.push(flow);
    groups.set(key, group);
  };
  for (const flow of flows) {
    const trigger = flow.def?.trigger;
    if (!trigger) add("broken", "Needs fixing", "var(--bad)", flow);
    else if (trigger.type === "schedule") add("schedule", "On a schedule", "var(--ok)", flow);
    else {
      // The budget is Money's: its flows sit with the ones that watch money.
      const collection = "collection" in trigger ? trigger.collection : "money";
      add(`c:${collection}`, collectionName(collection), "var(--teal)", flow);
    }
  }
  const rank = (g: FlowGroup) => (g.key === "schedule" ? 0 : g.key === "broken" ? 2 : 1);
  return [...groups.values()]
    .map((g) => ({ ...g, flows: [...g.flows].sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

const lanesOf = (flow: BoardFlow, adding: boolean) =>
  flow.def ? 1 + flow.def.steps.length + (adding ? 1 : 0) : 0;

/**
 * The whole board. `draft` replaces the selected flow's stored definition, so edits show on
 * the canvas before they are saved; the selected flow alone gets the + after its last step.
 */
export function boardGraph({
  groups,
  jobs,
  selection,
  draft,
  canAdd,
}: {
  groups: FlowGroup[];
  jobs: BoardJob[];
  selection: BoardSelection;
  draft: FlowDefinition | undefined;
  canAdd: boolean;
}): { nodes: BoardNode[]; edges: Edge[] } {
  const nodes: BoardNode[] = [];
  const edges: Edge[] = [];
  const selectedFlow = selection && "flow" in selection ? selection.flow : undefined;
  const widest = Math.max(
    JOB_COLUMNS,
    ...groups.flatMap((g) => g.flows.map((f) => 1 + lanesOf(f, f.id === selectedFlow && canAdd))),
  );
  const width = PAD * 2 + widest * COLUMN - (COLUMN - 232);
  let y = 0;

  for (const group of groups) {
    const groupId = `${GROUP_PREFIX}${group.key}`;
    const frame: Node<GroupData, "group"> = {
      id: groupId,
      type: "group",
      position: { x: 0, y },
      data: { label: group.label, count: group.flows.length, tone: group.tone },
      draggable: false,
      selectable: false,
      style: { width, height: 0 },
    };
    nodes.push(frame);
    let laneY = HEAD;
    for (const flow of group.flows) {
      const selected = flow.id === selectedFlow;
      const def = selected && draft ? draft : flow.def;
      nodes.push({
        id: laneId(flow.id, "card"),
        type: "flow",
        parentId: groupId,
        position: { x: PAD, y: laneY },
        draggable: false,
        data: {
          flowId: flow.id,
          title: flow.title,
          status: flow.status,
          ...(flow.lastRun ? { lastRun: flow.lastRun } : {}),
          selected,
        },
      });
      let hasElse = false;
      if (def) {
        // -1 selects no part: only the selected flow shows which part is open.
        const part = selected && selection && "flow" in selection ? selection.part : -1;
        const lane = flowGraph(def, part, selected && canAdd);
        for (const node of lane.nodes) {
          if (node.type === "stop") hasElse = true;
          nodes.push({
            ...node,
            id: laneId(flow.id, node.id),
            parentId: groupId,
            position: { x: PAD + COLUMN + node.position.x, y: laneY + node.position.y },
          } as BoardNode);
        }
        const live = flow.status === "on";
        edges.push({
          id: laneId(flow.id, "e-card"),
          source: laneId(flow.id, "card"),
          target: laneId(flow.id, "trigger"),
          className: `flow-edge flow-edge-card${live ? " live" : ""}`,
          animated: live,
        });
        for (const edge of lane.edges) {
          const isElse = edge.className?.includes("else") ?? false;
          edges.push({
            ...edge,
            id: laneId(flow.id, edge.id),
            source: laneId(flow.id, edge.source),
            target: laneId(flow.id, edge.target),
            className: `${edge.className ?? "flow-edge"}${live && !isElse ? " live" : ""}`,
            animated: live && !isElse,
          });
        }
      }
      laneY += LANE + (hasElse ? ELSE_ROW : 0);
    }
    frame.style = { width, height: laneY + PAD - (LANE - 92) };
    y += (frame.style.height as number) + GAP;
  }

  if (jobs.length > 0) {
    const groupId = `${GROUP_PREFIX}jobs`;
    const rows = Math.ceil(jobs.length / JOB_COLUMNS);
    nodes.push({
      id: groupId,
      type: "group",
      position: { x: 0, y },
      data: { label: "System · keeps the Cave running", count: jobs.length, tone: "var(--warn)" },
      draggable: false,
      selectable: false,
      style: { width, height: HEAD + rows * JOB_ROW + PAD - 20 },
    });
    jobs.forEach((job, i) => {
      nodes.push({
        id: `${JOB_PREFIX}${job.id}`,
        type: "job",
        parentId: groupId,
        position: {
          x: PAD + (i % JOB_COLUMNS) * COLUMN,
          y: HEAD + Math.floor(i / JOB_COLUMNS) * JOB_ROW,
        },
        draggable: false,
        data: {
          jobId: job.id,
          label: job.label,
          schedule: job.schedule,
          ...(job.lastResult ? { lastResult: job.lastResult } : {}),
          selected: selection !== undefined && "job" in selection && selection.job === job.id,
        },
      });
    });
  }
  return { nodes, edges };
}
