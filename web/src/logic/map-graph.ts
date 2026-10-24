import type { Edge, Node } from "@xyflow/react";
import {
  autoLayout,
  type MapPoint,
  type ProjectMap,
  type ShapeKind,
} from "../../../shared/project-map.ts";
import type { Doc } from "../../../shared/types.ts";
import { titleOf } from "./views.ts";

/** What a card on the map shows; `run` cards glow while active (part 4). */
export type CardData = {
  kind: "part" | "task" | "item";
  title: string;
  collection: string;
  status?: string;
  docId: string;
};
export type NoteData = { text: string };
export type ShapeData = { kind: ShapeKind; text: string };
export type GroupData = { title: string };
export type RunData = { title: string; status: string; step?: string };

/** An active run, as the map draws it beside its part. */
interface MapRun {
  id: string;
  title: string;
  status: string;
  part?: string;
  /** The newest step's title. */
  step?: string;
}

export type MapNode =
  | Node<CardData, "card">
  | Node<NoteData, "note">
  | Node<GroupData, "frame">
  | Node<ShapeData, "shape">
  | Node<RunData, "run">;

const status = (d: Doc) => (typeof d.data.status === "string" ? d.data.status : undefined);

/**
 * The project's map as React Flow nodes and edges: its parts, tasks and other linked items as
 * cards (placed where the owner left them, else by the automatic layout), the map's own notes
 * and groups, a "contains" edge from each part to its tasks and the owner's "depends on" edges.
 */
export function buildGraph(
  parts: Doc[],
  tasks: Doc[],
  others: Doc[],
  map: ProjectMap,
  runs: MapRun[] = [],
): { nodes: MapNode[]; edges: Edge[] } {
  // Parts keep their order (then title) down a column.
  const order = (d: Doc) => (typeof d.data.order === "number" ? d.data.order : 1e9);
  parts = [...parts].sort(
    (a, b) =>
      order(a) - order(b) || (titleOf(a) < titleOf(b) ? -1 : titleOf(a) > titleOf(b) ? 1 : 0),
  );
  const at = autoLayout(parts, tasks, others, map.positions);
  const card = (d: Doc, kind: CardData["kind"]): MapNode => ({
    id: d.id,
    type: "card",
    // Items leave the map only by being deleted or unlinked, never from the canvas.
    deletable: false,
    position: at[d.id] as MapPoint,
    data: {
      kind,
      title: titleOf(d),
      collection: d.collection ?? "",
      ...(status(d) ? { status: status(d) as string } : {}),
      docId: d.id,
    },
  });
  const groups: MapNode[] = map.groups.map((g) => ({
    id: g.id,
    type: "frame",
    position: { x: g.x, y: g.y },
    style: { width: g.w, height: g.h },
    zIndex: -1,
    data: { title: g.title },
  }));
  const shapes: MapNode[] = map.shapes.map((s) => ({
    id: s.id,
    type: "shape",
    position: { x: s.x, y: s.y },
    style: { width: s.w, height: s.h },
    data: { kind: s.kind, text: s.text },
  }));
  const notes: MapNode[] = map.notes.map((n) => ({
    id: n.id,
    type: "note",
    position: { x: n.x, y: n.y },
    data: { text: n.text },
  }));
  const partIds = new Set(parts.map((p) => p.id));
  const contains: Edge[] = tasks
    .filter((t) => typeof t.data.part === "string" && partIds.has(t.data.part))
    .map((t) => ({
      id: `contains-${t.id}`,
      source: t.data.part as string,
      target: t.id,
      sourceHandle: "contains",
      className: "map-edge-contains",
      deletable: false,
    }));
  const depends: Edge[] = map.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    className: "map-edge-depends",
    label: "depends on",
  }));
  // Runs aren't stored on the map: each glows to the right of its part while it is active.
  const beside = new Map<string, number>();
  const runNodes: MapNode[] = runs.map((r) => {
    const anchor = (r.part ? at[r.part] : undefined) ?? { x: -280, y: 0 };
    const n = beside.get(r.part ?? "") ?? 0;
    beside.set(r.part ?? "", n + 1);
    return {
      id: `run-${r.id}`,
      type: "run",
      position: { x: anchor.x + 260, y: anchor.y + n * 90 },
      draggable: false,
      deletable: false,
      data: { title: r.title, status: r.status, ...(r.step ? { step: r.step } : {}) },
    };
  });
  const runEdges: Edge[] = runs
    .filter((r) => r.part && partIds.has(r.part))
    .map((r) => ({
      id: `run-edge-${r.id}`,
      source: r.part as string,
      target: `run-${r.id}`,
      animated: true,
      className: "map-edge-run",
      deletable: false,
    }));
  return {
    nodes: [
      ...groups,
      ...parts.map((d) => card(d, "part")),
      ...tasks.map((d) => card(d, "task")),
      ...others.map((d) => card(d, "item")),
      ...shapes,
      ...notes,
      ...runNodes,
    ],
    edges: [...contains, ...depends, ...runEdges],
  };
}

/** The map after a node moved: an item's position, or a note or group's own x and y. */
export function moved(map: ProjectMap, id: string, p: MapPoint): ProjectMap {
  const point = { x: Math.round(p.x), y: Math.round(p.y) };
  if (map.notes.some((n) => n.id === id))
    return { ...map, notes: map.notes.map((n) => (n.id === id ? { ...n, ...point } : n)) };
  if (map.groups.some((g) => g.id === id))
    return { ...map, groups: map.groups.map((g) => (g.id === id ? { ...g, ...point } : g)) };
  if (map.shapes.some((s) => s.id === id))
    return { ...map, shapes: map.shapes.map((s) => (s.id === id ? { ...s, ...point } : s)) };
  return { ...map, positions: { ...map.positions, [id]: point } };
}

/** A short id for a note, group or edge the map owns; never an item id. */
export const localId = (prefix: "n" | "g" | "e" | "s", taken: ReadonlySet<string>): string => {
  for (let i = 1; ; i++) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
};
