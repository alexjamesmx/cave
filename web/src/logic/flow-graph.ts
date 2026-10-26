import type { Edge, Node } from "@xyflow/react";
import { type FlowDefinition, specOf } from "../../../shared/flows/registry.ts";
import type { Selection } from "./flow-edit.ts";

/**
 * A flow as a graph (M11 part 7): the trigger on the left, its steps to the right in order,
 * an edge between each pair, an "else stop" branch under every `if`, and a + after the last
 * step while there is room for one (M13). The graph only shows and selects; every edit goes
 * through the inspector (`PartEditor`) into the same definition.
 */

/** A type alias, not an interface: React Flow's node data needs an index signature. */
export type PartData = {
  kind: "trigger" | "step";
  type: string;
  label: string;
  text: string;
  sensitive: boolean;
  selected: boolean;
  /** 1-based for steps; 0 for the trigger. */
  position: number;
};

export type FlowNode =
  | Node<PartData, "part">
  | Node<Record<string, never>, "stop">
  | Node<Record<string, never>, "add">;

export const COLUMN = 260;
const STOP_DROP = 120;

export const TRIGGER_ID = "trigger";
export const ADD_ID = "add";
export const stepId = (index: number) => `step-${index}`;

/** The selection a node id stands for; a stop node and unknown ids select nothing. */
export function selectionOf(id: string): Selection | undefined {
  if (id === TRIGGER_ID) return "trigger";
  const m = /^step-(\d+)$/.exec(id);
  return m ? Number(m[1]) : undefined;
}

export function flowGraph(
  def: FlowDefinition,
  selected: Selection,
  canAdd = false,
): { nodes: FlowNode[]; edges: Edge[] } {
  const part = (
    id: string,
    kind: "trigger" | "step",
    p: { type: string },
    position: number,
    sel: Selection,
  ): FlowNode => {
    const spec = specOf(kind, p.type);
    return {
      id,
      type: "part",
      position: { x: position * COLUMN, y: 0 },
      draggable: false,
      deletable: false,
      data: {
        kind,
        type: p.type,
        label: spec?.label ?? p.type,
        text: spec?.describe(p as Record<string, unknown>) ?? p.type,
        sensitive: spec?.sensitive === true,
        selected: selected === sel,
        position,
      },
    };
  };
  const nodes: FlowNode[] = [part(TRIGGER_ID, "trigger", def.trigger, 0, "trigger")];
  const edges: Edge[] = [];
  def.steps.forEach((step, i) => {
    const id = stepId(i);
    nodes.push(part(id, "step", step, i + 1, i));
    edges.push({
      id: `e-${i}`,
      source: i === 0 ? TRIGGER_ID : stepId(i - 1),
      target: id,
      className: "flow-edge",
    });
    if (step.type === "if") {
      const stop = `stop-${i}`;
      nodes.push({
        id: stop,
        type: "stop",
        position: { x: (i + 1) * COLUMN, y: STOP_DROP },
        draggable: false,
        deletable: false,
        selectable: false,
        data: {},
      });
      edges.push({
        id: `else-${i}`,
        source: id,
        target: stop,
        sourceHandle: "else",
        label: "else",
        className: "flow-edge flow-edge-else",
      });
    }
  });
  if (canAdd) {
    const last = def.steps.length;
    nodes.push({
      id: ADD_ID,
      type: "add",
      position: { x: (last + 1) * COLUMN, y: 0 },
      draggable: false,
      deletable: false,
      selectable: false,
      data: {},
    });
    edges.push({
      id: "e-add",
      source: last === 0 ? TRIGGER_ID : stepId(last - 1),
      target: ADD_ID,
      className: "flow-edge flow-edge-add",
    });
  }
  return { nodes, edges };
}
