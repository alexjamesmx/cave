import { type Edge, Handle, type NodeProps, Panel, Position } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";
import {
  type BoardNode,
  boardTarget,
  type FlowCardData,
  type GroupData,
  type JobData,
} from "../../logic/flow-board.ts";
import type { Selection } from "../../logic/flow-edit.ts";
import type { PartData } from "../../logic/flow-graph.ts";
import { Icon } from "../icon.tsx";
import { MapCanvas } from "../MapCanvas.tsx";
import { lookOf } from "./look.ts";

export const STATUS: Record<string, { label: string; color: string }> = {
  on: { label: "On", color: "var(--ok)" },
  off: { label: "Off", color: "var(--muted)" },
  draft: { label: "Draft", color: "var(--muted)" },
  "pending-approval": { label: "Needs approval", color: "var(--warn)" },
};
export const statusOf = (s: string) =>
  STATUS[s] ?? (STATUS.draft as { label: string; color: string });

const ago = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** One trigger or step: a button, so the keyboard and the e2e reach it like a card. */
function PartNode({ data }: NodeProps<Extract<BoardNode, { type: "part" }>>) {
  const d = data as PartData;
  const look = lookOf(d.type);
  return (
    <div
      className={`flow-node${d.selected ? " on" : ""}`}
      style={{ "--tone": look.color } as CSSProperties}
    >
      {d.kind === "step" && <Handle type="target" position={Position.Left} isConnectable={false} />}
      <button type="button" className="flow-node-body" aria-pressed={d.selected}>
        <span className="ico flow-node-ico">
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

// The + after the selected flow's last step; the step types open in the inspector.
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

/** A flow's card at the start of its lane: its name, its state and its last run. */
function FlowCardNode({ data }: NodeProps<Extract<BoardNode, { type: "flow" }>>) {
  const d = data as FlowCardData;
  const status = statusOf(d.status);
  return (
    <div className={`flow-card-node${d.selected ? " on" : ""}`} data-status={d.status}>
      <button
        type="button"
        className="flow-card-body"
        aria-pressed={d.selected}
        aria-label={`Flow ${d.title}`}
      >
        <span className="flow-card-name">{d.title}</span>
        <span className="flow-card-meta">
          <span className="flow-status" style={{ "--tone": status.color } as CSSProperties}>
            <span className="flow-status-dot" />
            {status.label}
          </span>
          <span className="muted num">
            {d.lastRun ? `${d.lastRun.result} · ${ago(d.lastRun.at)}` : "never ran"}
          </span>
        </span>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function JobNode({ data }: NodeProps<Extract<BoardNode, { type: "job" }>>) {
  const d = data as JobData;
  return (
    <div className={`flow-job-node${d.selected ? " on" : ""}`}>
      <button
        type="button"
        className="flow-card-body"
        aria-pressed={d.selected}
        aria-label={`System ${d.label}`}
      >
        <span className="flow-card-name">
          <Icon name="cog" size={14} /> {d.label}
        </span>
        <span className="muted flow-job-schedule">{d.schedule}</span>
      </button>
    </div>
  );
}

/** A group's frame: a label in its corner, the lanes drawn on top. */
function GroupNode({ data }: NodeProps<Extract<BoardNode, { type: "group" }>>) {
  const d = data as GroupData;
  return (
    <div className="flow-group" style={{ "--tone": d.tone } as CSSProperties}>
      <span className="flow-group-label">
        {d.label} <span className="num">{d.count}</span>
      </span>
    </div>
  );
}

const NODE_TYPES = {
  part: PartNode,
  stop: StopNode,
  add: AddNode,
  flow: FlowCardNode,
  job: JobNode,
  group: GroupNode,
};

/**
 * Every flow and built-in job on one React Flow canvas (after M13). A click on a flow's card or one
 * of its parts selects it for the inspector; the inspector is the only thing that edits.
 */
export function FlowBoard({
  nodes,
  edges,
  onSelect,
  onAdd,
  toolbar,
}: {
  nodes: BoardNode[];
  edges: Edge[];
  onSelect(target: { flow: string; part?: Selection } | { job: string }): void;
  /** The + was pressed on the selected flow. */
  onAdd(): void;
  toolbar: ReactNode;
}) {
  requestAdd = onAdd;
  // Opened on a flow or a job: the first view frames its group rather than the whole board.
  const focus = nodes.find(
    (n) => (n.type === "flow" || n.type === "job") && (n.data as { selected: boolean }).selected,
  )?.parentId;
  return (
    <MapCanvas<BoardNode, Edge>
      label="Flow canvas"
      minimap={false}
      className="flow-board-canvas"
      nodeTypes={NODE_TYPES}
      nodes={nodes}
      edges={edges}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitViewOptions={{ padding: 0.12, maxZoom: 1, ...(focus ? { nodes: [{ id: focus }] } : {}) }}
      onNodeClick={(_, node) => {
        const target = boardTarget(node.id);
        if (target) onSelect(target);
      }}
    >
      <Panel position="top-left" className="flow-board-toolbar">
        {toolbar}
      </Panel>
    </MapCanvas>
  );
}
