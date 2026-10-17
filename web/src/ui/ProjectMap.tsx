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
} from "../../../shared/project-map.ts";
import { linkedTo, PARTS, templatesOf } from "../../../shared/projects.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import {
  buildGraph,
  type CardData,
  type GroupData,
  localId,
  type MapNode,
  moved,
  type NoteData,
} from "../logic/map-graph.ts";
import { useAllItems, useDoc } from "../store/queries.ts";
import { DocDrawer } from "./DocDrawer.tsx";
import { MapCanvas } from "./MapCanvas.tsx";

interface Editing {
  editable: boolean;
  setNote(id: string, text: string): void;
  resizeGroup(id: string, w: number, h: number): void;
  renameGroup(id: string, title: string): void;
}
const EditContext = createContext<Editing>({
  editable: false,
  setNote: () => {},
  resizeGroup: () => {},
  renameGroup: () => {},
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

// "frame", not "group": React Flow styles its own group type.
const NODE_TYPES = { card: CardNode, note: NoteNode, frame: GroupNode };

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

/** A project's Map tab: its parts, tasks and items on a whiteboard, saved in its `map` key. */
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
  const graph = useMemo(
    () => buildGraph(linked.parts, linked.tasks, linked.others, layout),
    [linked, layout],
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
    ]);
  const editing: Editing = {
    editable,
    setNote: (id, text) =>
      save({ ...layout, notes: layout.notes.map((n) => (n.id === id ? { ...n, text } : n)) }),
    resizeGroup: (id, w, h) =>
      save({ ...layout, groups: layout.groups.map((g) => (g.id === id ? { ...g, w, h } : g)) }),
    renameGroup: (id, title) =>
      save({ ...layout, groups: layout.groups.map((g) => (g.id === id ? { ...g, title } : g)) }),
  };
  const connect = ({ source, target }: Connection) => {
    const parts = new Set(linked.parts.map((p) => p.id));
    if (!source || !target || !parts.has(source) || !parts.has(target) || source === target) return;
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
          <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>
            Drag to arrange; connect two parts for "depends on"; double-click a card to open it;
            select a note, frame or edge and press Delete to remove it.
          </span>
        </div>
      )}
      <MapCanvas<MapNode, Edge>
        label="Project map"
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
