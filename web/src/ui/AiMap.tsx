import type { Edge, Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { useMemo } from "react";
import type { OverviewColumn, OverviewEdge, OverviewNode } from "../../../shared/ai-overview.ts";
import { navigate } from "../app/router.ts";
import { StatusPill } from "./Activity.tsx";
import { MapCanvas } from "./MapCanvas.tsx";

const COLUMNS: OverviewColumn[] = ["surfaces", "connections", "tools", "automations"];
const TITLES: Record<OverviewColumn, string> = {
  surfaces: "Where AI is used",
  connections: "What connects it",
  tools: "The Cave's tools",
  automations: "What runs on its own",
};

type SetupNode = Node<OverviewNode, "setup"> | Node<{ title: string }, "heading">;

const when = (ms: number | undefined) =>
  ms
    ? new Date(ms).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : undefined;

function SetupCard({ data }: NodeProps<Extract<SetupNode, { type: "setup" }>>) {
  const d = data as OverviewNode;
  const last = when(d.lastActivity);
  return (
    <div className="map-card" data-status={d.status}>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="map-handle-hidden"
      />
      <span className="k">{d.kind}</span>
      <strong>{d.label}</strong>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <StatusPill status={d.status} />
        {last && (
          <span className="num muted" style={{ fontSize: 11 }}>
            {last}
          </span>
        )}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="map-handle-hidden"
      />
    </div>
  );
}

function Heading({ data }: NodeProps<Extract<SetupNode, { type: "heading" }>>) {
  return <span className="k map-heading">{(data as { title: string }).title}</span>;
}

const NODE_TYPES = { setup: SetupCard, heading: Heading };

/** The AI setup, read-only, in fixed columns; clicking a node opens it where it lives. */
export function AiMap({ nodes, edges }: { nodes: OverviewNode[]; edges: OverviewEdge[] }) {
  const flow = useMemo(() => {
    const rows = new Map<OverviewColumn, number>();
    const placed: SetupNode[] = COLUMNS.map((c, i) => ({
      id: `heading:${c}`,
      type: "heading",
      position: { x: i * 320, y: -70 },
      data: { title: TITLES[c] },
      selectable: false,
    }));
    for (const n of nodes) {
      const row = rows.get(n.column) ?? 0;
      rows.set(n.column, row + 1);
      placed.push({
        id: n.id,
        type: "setup",
        position: { x: COLUMNS.indexOf(n.column) * 320, y: row * 120 },
        data: n,
      });
    }
    const lines: Edge[] = edges.map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
    }));
    return { placed, lines };
  }, [nodes, edges]);
  return (
    // Nodes arrive in two steps (this device, then the server): remount so the view fits all.
    <MapCanvas<SetupNode, Edge>
      key={flow.placed.length}
      label="AI setup map"
      minimap={false}
      nodeTypes={NODE_TYPES}
      nodes={flow.placed}
      edges={flow.lines}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onNodeClick={(_, node) => {
        if (node.type === "setup") navigate((node.data as OverviewNode).href);
      }}
    />
  );
}
