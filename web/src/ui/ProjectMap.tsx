import {
  type Connection,
  type Edge,
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  useNodesState,
} from "@xyflow/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  EMPTY_MAP,
  type ProjectMap as Layout,
  parseMap,
  pruneMap,
  SHAPE_KINDS,
  type ShapeKind,
} from "../../../shared/project-map.ts";
import { linkedTo, PARTS, templatesOf } from "../../../shared/projects.ts";
import { isActiveRun } from "../../../shared/runs.ts";
import type { Doc } from "../../../shared/types.ts";
import { useActivity } from "../app/activity.ts";
import { useCave } from "../app/context.ts";
import {
  buildGraph,
  type CardData,
  type GroupData,
  localId,
  type MapNode,
  moved,
  type NoteData,
  type RunData,
  type ShapeData,
} from "../logic/map-graph.ts";
import { useAllItems, useDoc } from "../store/queries.ts";
import { DocDrawer } from "./DocDrawer.tsx";
import { MapCanvas } from "./MapCanvas.tsx";

interface Editing {
  editable: boolean;
  setNote(id: string, text: string): void;
  resizeGroup(id: string, w: number, h: number): void;
  renameGroup(id: string, title: string): void;
  setShape(id: string, patch: { text?: string; w?: number; h?: number }): void;
}
const EditContext = createContext<Editing>({
  editable: false,
  setNote: () => {},
  resizeGroup: () => {},
  renameGroup: () => {},
  setShape: () => {},
});

function CardNode({ data }: NodeProps<Extract<MapNode, { type: "card" }>>) {
  const d = data as CardData;
  return (
    <div className={`map-card map-card-${d.kind}`} data-status={d.status}>
      {d.kind === "part" && <Handle type="target" position={Position.Left} />}
      {/* Where a part's "contains" edge lands; not for drawing new edges. */}
      {d.kind === "task" && (
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={false}
          className="map-handle-hidden"
        />
      )}
      {d.kind === "part" && (
        <Handle
          id="contains"
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          className="map-handle-hidden"
        />
      )}
      <span className="k">{d.kind === "item" ? d.collection : d.kind}</span>
      <strong>{d.title}</strong>
      {d.status && <span className="map-status">{d.status}</span>}
      {d.kind === "part" && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

function NoteNode({ id, data }: NodeProps<Extract<MapNode, { type: "note" }>>) {
  const { editable, setNote } = useContext(EditContext);
  const text = (data as NoteData).text;
  if (!editable) return <div className="map-note">{text}</div>;
  return (
    <textarea
      key={text}
      className="map-note nodrag"
      aria-label="Sticky note"
      defaultValue={text}
      onBlur={(e) => {
        if (e.target.value !== text) setNote(id, e.target.value);
      }}
    />
  );
}

function GroupNode({ id, data, selected }: NodeProps<Extract<MapNode, { type: "frame" }>>) {
  const { editable, resizeGroup, renameGroup } = useContext(EditContext);
  const title = (data as GroupData).title;
  return (
    <div className="map-group">
      {editable && (
        <NodeResizer
          isVisible={selected ?? false}
          minWidth={160}
          minHeight={120}
          onResizeEnd={(_, p) => resizeGroup(id, Math.round(p.width), Math.round(p.height))}
        />
      )}
      {editable ? (
        <input
          key={title}
          className="map-group-title nodrag"
          aria-label="Frame title"
          defaultValue={title}
          onBlur={(e) => {
            if (e.target.value !== title) renameGroup(id, e.target.value);
          }}
        />
      ) : (
        <span className="map-group-title">{title}</span>
      )}
    </div>
  );
}

/** A drawn shape with text (M11 part 6): a rectangle, a rounded one or a diamond. */
function ShapeNode({ id, data, selected }: NodeProps<Extract<MapNode, { type: "shape" }>>) {
  const { editable, setShape } = useContext(EditContext);
  const d = data as ShapeData;
  return (
    <div className={`map-shape map-shape-${d.kind}`}>
      {editable && (
        <NodeResizer
          isVisible={selected ?? false}
          minWidth={80}
          minHeight={48}
          onResizeEnd={(_, p) => setShape(id, { w: Math.round(p.width), h: Math.round(p.height) })}
        />
      )}
      <Handle type="target" position={Position.Left} isConnectable={editable} />
      {editable ? (
        <input
          key={d.text}
          className="map-shape-text nodrag"
          aria-label={`${d.kind} shape text`}
          defaultValue={d.text}
          onBlur={(e) => {
            if (e.target.value !== d.text) setShape(id, { text: e.target.value });
          }}
        />
      ) : (
        <span className="map-shape-text">{d.text}</span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={editable} />
    </div>
  );
}

/** An active run beside its part, glowing; its newest step says what it is doing. */
function RunNode({ data }: NodeProps<Extract<MapNode, { type: "run" }>>) {
  const d = data as RunData;
  return (
    <div className="map-run" data-status={d.status}>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="map-handle-hidden"
      />
      <span className="k">run · {d.status}</span>
      <strong>{d.title}</strong>
      {d.step && <span className="muted">{d.step}</span>}
    </div>
  );
}

// "frame", not "group": React Flow styles its own group type.
const NODE_TYPES = {
  card: CardNode,
  note: NoteNode,
  frame: GroupNode,
  shape: ShapeNode,
  run: RunNode,
};

const SHAPE_LABEL: Record<ShapeKind, string> = {
  rect: "box",
  rounded: "rounded box",
  diamond: "diamond",
};

/** Desktop with a mouse edits the map; a phone views it (pan, zoom, tap to open). */
function useEditable(): boolean {
  const query = "(min-width: 768px) and (pointer: fine)";
  const [editable, setEditable] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setEditable(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return editable;
}

/** A project's Canvas tab: its parts, tasks, items and drawn shapes, saved in its `map` key. */
export function ProjectMap({ project }: { project: Doc }) {
  const { local } = useCave();
  const all = useAllItems(local.db);
  const settings = useDoc(local.db, "settings");
  const editable = useEditable();
  const [open, setOpen] = useState<Doc>();
  // The stored value only changes on a write; one object per value keeps React Flow still.
  const stored = project.data.map;
  const layout = useMemo(() => {
    const parsed = parseMap(stored);
    return parsed.ok ? parsed.map : EMPTY_MAP;
  }, [stored]);
  // Templates are rebuilt on every read; their collection list, as text, is stable.
  const shownKey = (
    templatesOf(settings?.data)[String(project.data.template ?? "generic")]?.collections ?? []
  )
    .filter((c) => c !== "tasks")
    .join(",");

  const linked = useMemo(() => {
    const of = (c: string) =>
      linkedTo(
        (all ?? []).filter((d) => d.collection === c),
        project.id,
      );
    const shown = shownKey ? shownKey.split(",") : [];
    return { parts: of(PARTS), tasks: of("tasks"), others: shown.flatMap(of) };
  }, [all, project.id, shownKey]);
  const { entries } = useActivity(project.id);
  const active = useMemo(
    () =>
      entries.filter(isActiveRun).map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        ...(e.part ? { part: e.part } : {}),
        ...(e.steps.at(-1) ? { step: e.steps.at(-1)?.title as string } : {}),
      })),
    [entries],
  );
  const graph = useMemo(
    () => buildGraph(linked.parts, linked.tasks, linked.others, layout, active),
    [linked, layout, active],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(graph.nodes);
  useEffect(() => setNodes(graph.nodes), [graph, setNodes]);

  const byId = useMemo(
    () => new Map([...linked.parts, ...linked.tasks, ...linked.others].map((d) => [d.id, d])),
    [linked],
  );
  const save = (next: Layout) =>
    void local.write(
      { id: project.id, kind: "item", collection: "projects" },
      { map: pruneMap(next, new Set(byId.keys())) },
    );
  const taken = () =>
    new Set([
      ...layout.notes.map((n) => n.id),
      ...layout.groups.map((g) => g.id),
      ...layout.edges.map((e) => e.id),
      ...layout.shapes.map((s) => s.id),
    ]);
  const editing: Editing = {
    editable,
    setNote: (id, text) =>
      save({ ...layout, notes: layout.notes.map((n) => (n.id === id ? { ...n, text } : n)) }),
    resizeGroup: (id, w, h) =>
      save({ ...layout, groups: layout.groups.map((g) => (g.id === id ? { ...g, w, h } : g)) }),
    renameGroup: (id, title) =>
      save({ ...layout, groups: layout.groups.map((g) => (g.id === id ? { ...g, title } : g)) }),
    setShape: (id, patch) =>
      save({ ...layout, shapes: layout.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
  };
  const connect = ({ source, target }: Connection) => {
    // Parts and shapes connect; cards of other kinds and notes do not.
    const ends = new Set([...linked.parts.map((p) => p.id), ...layout.shapes.map((s) => s.id)]);
    if (!source || !target || !ends.has(source) || !ends.has(target) || source === target) return;
    if (layout.edges.some((e) => e.from === source && e.to === target)) return;
    // Both ends need a stored place for the edge to be valid; take where they are drawn now.
    const at = (id: string) => nodes.find((n) => n.id === id)?.position ?? { x: 0, y: 0 };
    save({
      ...moved(moved(layout, source, at(source)), target, at(target)),
      edges: [...layout.edges, { id: localId("e", taken()), from: source, to: target }],
    });
  };
  const openCard = (id: string) => {
    const doc = byId.get(id);
    if (doc) setOpen(doc);
  };

  return (
    <EditContext.Provider value={editing}>
      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              save({
                ...layout,
                notes: [...layout.notes, { id: localId("n", taken()), text: "", x: 0, y: -160 }],
              })
            }
          >
            Add note
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              save({
                ...layout,
                groups: [
                  ...layout.groups,
                  { id: localId("g", taken()), title: "Frame", x: -40, y: -40, w: 480, h: 320 },
                ],
              })
            }
          >
            Add frame
          </button>
          {SHAPE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="btn"
              onClick={() =>
                save({
                  ...layout,
                  shapes: [
                    ...layout.shapes,
                    { id: localId("s", taken()), kind, text: "", x: 0, y: -300, w: 160, h: 72 },
                  ],
                })
              }
            >
              Add {SHAPE_LABEL[kind]}
            </button>
          ))}
          <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>
            Drag to arrange; connect parts and shapes for "depends on"; double-click a card to open
            it; select a note, frame, shape or edge and press Delete to remove it.
          </span>
        </div>
      )}
      <MapCanvas<MapNode, Edge>
        label="Project canvas"
        minimap={editable}
        nodeTypes={NODE_TYPES}
        nodes={nodes}
        edges={graph.edges}
        onNodesChange={onNodesChange}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable={editable}
        onNodeDragStop={(_, node) => save(moved(layout, node.id, node.position))}
        onConnect={connect}
        onNodesDelete={(gone) => {
          const ids = new Set(gone.map((n) => n.id));
          save({
            ...layout,
            notes: layout.notes.filter((n) => !ids.has(n.id)),
            groups: layout.groups.filter((g) => !ids.has(g.id)),
            shapes: layout.shapes.filter((s) => !ids.has(s.id)),
            edges: layout.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
          });
        }}
        onEdgesDelete={(gone) => {
          const ids = new Set(gone.map((e) => e.id));
          save({ ...layout, edges: layout.edges.filter((e) => !ids.has(e.id)) });
        }}
        onNodeDoubleClick={(_, node) => openCard(node.id)}
        onNodeClick={(_, node) => {
          if (!editable) openCard(node.id);
        }}
      />
      {open && (
        <DocDrawer
          id={open.id}
          collection={open.collection ?? ""}
          onClose={() => setOpen(undefined)}
        />
      )}
    </EditContext.Provider>
  );
}
