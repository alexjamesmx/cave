import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeTypes,
  ReactFlow,
  type ReactFlowProps,
} from "@xyflow/react";

/**
 * React Flow with the Cave's look: dark, a dotted background, zoom controls, and the minimap
 * on a desktop only. The project Map and the Flows board both draw through it.
 */
export function MapCanvas<N extends Node, E extends Edge>({
  label,
  minimap,
  className,
  children,
  ...props
}: ReactFlowProps<N, E> & { label: string; minimap: boolean; nodeTypes: NodeTypes }) {
  return (
    <section className={`panel map-canvas${className ? ` ${className}` : ""}`} aria-label={label}>
      <ReactFlow<N, E>
        colorMode="dark"
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        {...props}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
        {minimap && <MiniMap pannable zoomable />}
        {children}
      </ReactFlow>
    </section>
  );
}
