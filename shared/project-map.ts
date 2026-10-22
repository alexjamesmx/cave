import { isDocId } from "./ids.ts";
import type { Field } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * A project's whiteboard (M8 part 3), stored in its `map` key as one value that merges as a
 * unit: where nodes sit, the sticky notes and groups that live only on the map, and the
 * "depends on" edges the owner or an agent drew. Items without a stored position are placed
 * by `autoLayout`. Text is plain text: the map renders it as text, never as HTML.
 */

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface MapGroup {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
}

export interface ProjectMap {
  version: 1;
  positions: Record<string, MapPoint>;
  notes: MapNote[];
  groups: MapGroup[];
  edges: MapEdge[];
}

export const EMPTY_MAP: ProjectMap = {
  version: 1,
  positions: {},
  notes: [],
  groups: [],
  edges: [],
};

export const MAP_LIMITS = { nodes: 500, edges: 500, text: 2000, bytes: 200_000 } as const;

/** Map-only ids (notes, groups, edges): short, so they can't carry content. */
const LOCAL_ID = /^[a-z][a-z0-9_-]{0,63}$/;
// Text is shown as text; refusing anything tag-shaped keeps a careless renderer safe too.
const TAG = /<\s*\/?\s*[a-z!?]/i;
const COORD = 1e6;

type Parsed = { ok: true; map: ProjectMap } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const coord = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= COORD;
const size = (v: unknown) => coord(v) && (v as number) > 0;

function text(v: unknown, what: string): string | undefined {
  if (typeof v !== "string") return `${what} must be text`;
  if (v.length > MAP_LIMITS.text) return `${what} is longer than ${MAP_LIMITS.text} characters`;
  if (TAG.test(v)) return `${what} must be plain text, not HTML`;
  return undefined;
}

/**
 * Checks a stored or proposed map: shape, sizes, plain text, and that every edge joins two
 * nodes the map knows (an item it places, or one of its notes or groups).
 */
export function parseMap(value: unknown): Parsed {
  const fail = (error: string): Parsed => ({ ok: false, error });
  if (!isRecord(value) || value.version !== 1) return fail("must be a map with version 1");
  if (JSON.stringify(value).length > MAP_LIMITS.bytes) return fail("is too large");
  const { positions, notes, groups, edges } = value;
  if (
    !isRecord(positions) ||
    !Array.isArray(notes) ||
    !Array.isArray(groups) ||
    !Array.isArray(edges)
  )
    return fail("needs positions, notes, groups and edges");
  const nodeCount = Object.keys(positions).length + notes.length + groups.length;
  if (nodeCount > MAP_LIMITS.nodes) return fail(`has more than ${MAP_LIMITS.nodes} nodes`);
  if (edges.length > MAP_LIMITS.edges) return fail(`has more than ${MAP_LIMITS.edges} edges`);

  const ids = new Set<string>();
  for (const [id, p] of Object.entries(positions)) {
    if (!isDocId(id) && !LOCAL_ID.test(id)) return fail(`position ${id} is not a node id`);
    if (!isRecord(p) || !coord(p.x) || !coord(p.y)) return fail(`position ${id} needs x and y`);
    ids.add(id);
  }
  for (const n of notes) {
    if (!isRecord(n) || typeof n.id !== "string" || !LOCAL_ID.test(n.id))
      return fail("a note needs an id");
    const bad = text(n.text, `note ${n.id}`);
    if (bad) return fail(bad);
    if (!coord(n.x) || !coord(n.y)) return fail(`note ${n.id} needs x and y`);
    ids.add(n.id);
  }
  for (const g of groups) {
    if (!isRecord(g) || typeof g.id !== "string" || !LOCAL_ID.test(g.id))
      return fail("a group needs an id");
    const bad = text(g.title, `group ${g.id}`);
    if (bad) return fail(bad);
    if (!coord(g.x) || !coord(g.y) || !size(g.w) || !size(g.h))
      return fail(`group ${g.id} needs x, y, w and h`);
    ids.add(g.id);
  }
  for (const e of edges) {
    if (!isRecord(e) || typeof e.id !== "string" || !LOCAL_ID.test(e.id))
      return fail("an edge needs an id");
    if (typeof e.from !== "string" || typeof e.to !== "string")
      return fail(`edge ${e.id} needs from and to`);
    if (!ids.has(e.from) || !ids.has(e.to))
      return fail(`edge ${e.id} joins a node the map doesn't place`);
    if (e.from === e.to) return fail(`edge ${e.id} joins a node to itself`);
  }
  return { ok: true, map: value as unknown as ProjectMap };
}

/** Positions and edges of items that no longer exist are dropped before a save. */
export function pruneMap(map: ProjectMap, live: ReadonlySet<string>): ProjectMap {
  const local = new Set([...map.notes.map((n) => n.id), ...map.groups.map((g) => g.id)]);
  const keep = (id: string) => live.has(id) || local.has(id);
  const positions = Object.fromEntries(Object.entries(map.positions).filter(([id]) => keep(id)));
  const placed = new Set([...Object.keys(positions), ...local]);
  return {
    ...map,
    positions,
    edges: map.edges.filter((e) => placed.has(e.from) && placed.has(e.to)),
  };
}

const COLUMN = 300;
const ROW = 110;
const PART_ORDER = ["active", "blocked", "planned", "done", "dropped"];

/**
 * Where items without a stored position go: parts in columns by status, each part's tasks
 * under it, tasks with no part and other items in a last column. Stored positions win, so
 * items added later find a free spot without moving what the owner arranged.
 */
export function autoLayout(
  parts: Doc[],
  tasks: Doc[],
  others: Doc[],
  stored: Record<string, MapPoint>,
): Record<string, MapPoint> {
  const out: Record<string, MapPoint> = {};
  const place = (id: string, p: MapPoint) => {
    out[id] = stored[id] ?? p;
  };
  const statusOf = (d: Doc) => {
    const i = PART_ORDER.indexOf(String(d.data.status));
    return i < 0 ? PART_ORDER.length : i;
  };
  const columns = new Map<number, Doc[]>();
  for (const part of parts)
    columns.set(statusOf(part), [...(columns.get(statusOf(part)) ?? []), part]);
  const used = [...columns.keys()].sort((a, b) => a - b);
  let x = 0;
  for (const col of used) {
    let y = 0;
    for (const part of columns.get(col) ?? []) {
      place(part.id, { x, y });
      y += ROW;
      for (const task of tasks.filter((t) => t.data.part === part.id)) {
        place(task.id, { x: x + 24, y });
        y += ROW * 0.8;
      }
      y += ROW * 0.4;
    }
    x += COLUMN;
  }
  const loose = [...tasks.filter((t) => !parts.some((p) => p.id === t.data.part)), ...others];
  for (const [i, d] of loose.entries()) place(d.id, { x, y: i * ROW * 0.8 });
  return out;
}

/** The projects field (seed migration 12); fresh databases get it from the seed. */
export const MAP_FIELD: Field = { id: "map", name: "Map", type: "json", config: { schema: "map" } };

/** Seed migration 12: projects gain the `map` field when they lack it. Items are untouched. */
export function mapMigration(
  get: (id: string) => Doc | undefined,
): { id: string; kind: "collection"; data: Record<string, unknown> }[] {
  const projects = get("projects");
  const fields = projects?.kind === "collection" ? projects.data.fields : undefined;
  if (!Array.isArray(fields) || projects?.data._deleted === true) return [];
  if ((fields as Field[]).some((f) => f.id === MAP_FIELD.id)) return [];
  return [{ id: "projects", kind: "collection", data: { fields: [...fields, MAP_FIELD] } }];
}
