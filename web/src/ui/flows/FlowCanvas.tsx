import { type Edge, Handle, type NodeProps, Position } from "@xyflow/react";
import { useMemo } from "react";
import type { FlowDefinition } from "../../../../shared/flows/registry.ts";
import type { Selection } from "../../logic/flow-edit.ts";
import { type FlowNode, flowGraph, type PartData, selectionOf } from "../../logic/flow-graph.ts";
import { Icon } from "../icon.tsx";
import { MapCanvas } from "../MapCanvas.tsx";
import { lookOf } from "./look.ts";

/** One trigger or step: a button, so the keyboard and the e2e reach it like a card. */
function PartNode({ data }: NodeProps<Extract<FlowNode, { type: "part" }>>) {
  const d = data as PartData;
  const look = lookOf(d.type);
  return (
    <div className={`flow-node${d.selected ? " on" : ""}`}>
      {d.kind === "step" && <Handle type="target" position={Position.Left} isConnectable={false} />}
      <button type="button" className="flow-node-body" aria-pressed={d.selected}>
        <span className="ico" style={{ background: "var(--on)", color: look.color }}>
          <Icon name={look.icon} size={18} />
        </span>
        <span style={{ display: "grid", gap: 2, minWidth: 0, textAlign: "left" }}>
          <span className="k">
            {d.kind === "trigger" ? "Trigger" : `Step ${d.position}`} · {d.label}
          </span>
          <span className="flow-node-text">{d.text}</span>
        </span>
        {d.sensitive && <span className="chip flow-node-approval">needs approval</span>}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
      {d.type === "if" && (
        <Handle
          id="else"
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          className="flow-handle-else"
        />
      )}
    </div>
  );
}

function StopNode() {
  return (
    <div className="flow-stop">
      <Handle type="target" position={Position.Top} isConnectable={false} />
      stop
    </div>
  );
}

// The + after the last step; the step types open in the inspector beside the canvas.
let requestAdd: () => void = () => {};

function AddNode() {
  return (
    <div className="flow-add">
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        className="flow-add-button nodrag nopan"
        aria-label="Add a step"
        onClick={(e) => {
          e.stopPropagation();
          requestAdd();
        }}
      >
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}

const NODE_TYPES = { part: PartNode, stop: StopNode, add: AddNode };

/**
 * The flow as a graph on React Flow: the trigger on the left, the steps to the right, an
 * "else stop" under each `if`, and a + to add a step. Clicking a node opens it in the
 * inspector; the inspector is the only thing that edits a part.
 */
export function FlowCanvas({
  def,
  selected,
  onSelect,
  onAdd,
}: {
  def: FlowDefinition;
  selected: Selection;
  onSelect(selection: Selection): void;
  /** The + was pressed; without it there is no +. */
  onAdd?: () => void;
}) {
  requestAdd = onAdd ?? (() => {});
  // On whether there is a +, never on the handler: a new graph each render re-measures every
  // node, and React Flow keeps them hidden until it has.
  const canAdd = onAdd !== undefined;
  const graph = useMemo(() => flowGraph(def, selected, canAdd), [def, selected, canAdd]);
  return (
    <MapCanvas<FlowNode, Edge>
      label="Flow canvas"
      minimap={false}
      nodeTypes={NODE_TYPES}
      nodes={graph.nodes}
      edges={graph.edges}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onNodeClick={(_, node) => {
        const s = selectionOf(node.id);
        if (s !== undefined) onSelect(s);
      }}
    />
  );
}
