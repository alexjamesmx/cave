import type { ProjectState } from "../../../shared/project-status.ts";

/**
 * Where each project sits in the Scene (M11 part 5): rings by status, a deterministic angle
 * from the project id so an orb stays where it was between visits, then a spread pass so
 * labels never overlap. Pure; the canvas only draws what this returns.
 */

export interface SceneInput {
  id: string;
  title: string;
  /** "72% · on track · agent working", from the status model. */
  line: string;
  state: ProjectState;
  /** Docs changed this week; sets the radius. */
  activity: number;
  agent: boolean;
}

export interface SceneNode extends SceneInput {
  x: number;
  y: number;
  radius: number;
  ring: number;
  /** Paused orbs are drawn dim. */
  opacity: number;
}

export interface LayoutOptions {
  /** Label box under an orb, used to keep neighbours apart. */
  labelWidth?: number;
  labelHeight?: number;
  /** Phones: bigger orbs, label inside. */
  compact?: boolean;
}

export const MIN_RADIUS = 14;
export const MAX_RADIUS = 34;
const FULL_ACTIVITY = 20;
/** The centre orb and its two lines of text. */
const CENTRE_CLEARANCE = 72;
const RINGS = 4;

/** 0 → 14 px, 20+ → 34 px, the square root in between. */
export function radiusFor(activity: number, compact = false): number {
  const share = Math.sqrt(Math.min(Math.max(activity, 0), FULL_ACTIVITY) / FULL_ACTIVITY);
  const r = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * share;
  return compact ? Math.max(r, 26) : r;
}

/** Blocked and waiting nearest, slipping next, on track, paused outermost. */
export function ringOf(state: ProjectState): number {
  if (state === "blocked" || state === "waiting") return 0;
  if (state === "slipping") return 1;
  if (state === "paused") return 3;
  return 2;
}

/** FNV-1a over the id, as a fraction of the circle. */
export function angleOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h / 0x100000000) * Math.PI * 2;
}

/** The label box of a node, for overlap checks. */
export function boxOf(n: SceneNode, o: LayoutOptions = {}) {
  const w = o.compact ? n.radius * 2 + 6 : Math.max(o.labelWidth ?? 120, n.radius * 2);
  const h = n.radius * 2 + (o.compact ? 6 : (o.labelHeight ?? 34));
  return { left: n.x - w / 2, top: n.y - n.radius, right: n.x + w / 2, bottom: n.y - n.radius + h };
}

export const overlaps = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Places `inputs` in a `width` by `height` area. The order of `inputs` does not matter: nodes
 * are sorted by id first. Rings are spaced from the centre's clearance to the edge; a crowded
 * ring splits into sub-rings so neighbours keep an arc of at least one label apart.
 */
export function layout(
  inputs: SceneInput[],
  width: number,
  height: number,
  o: LayoutOptions = {},
): SceneNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const labelW = o.compact ? MAX_RADIUS * 2 + 6 : (o.labelWidth ?? 120);
  const labelH = o.compact ? 6 : (o.labelHeight ?? 34);
  const edge = MAX_RADIUS + labelH / 2 + 8;
  const outer = Math.min(width, height) / 2 - edge;
  // The first ring clears the centre's name and goal; the last sits at the edge.
  const inner = CENTRE_CLEARANCE + labelW / 2;
  const step = Math.max((outer - inner) / (RINGS - 1), o.compact ? 36 : 48);
  const ringRadius = (ring: number) => inner + ring * step;

  const nodes: SceneNode[] = [...inputs]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => ({
      ...p,
      x: cx,
      y: cy,
      radius: radiusFor(p.activity, o.compact),
      ring: ringOf(p.state),
      opacity: p.state === "paused" ? 0.55 : 1,
    }));

  const centre = {
    left: cx - CENTRE_CLEARANCE,
    top: cy - CENTRE_CLEARANCE / 2,
    right: cx + CENTRE_CLEARANCE,
    bottom: cy + CENTRE_CLEARANCE / 2,
  };
  const placed: SceneNode[] = [];
  const free = (n: SceneNode) => {
    const b = boxOf(n, o);
    if (b.left < 0 || b.top < 0 || b.right > width || b.bottom > height) return false;
    if (overlaps(b, centre)) return false;
    return placed.every((p) => !overlaps(b, boxOf(p, o)));
  };

  for (let ring = 0; ring < RINGS; ring++) {
    const own = nodes.filter((n) => n.ring === ring);
    if (own.length === 0) continue;
    const r = ringRadius(ring);
    const slots = own.map((n) => ({ n, a: angleOf(n.id) })).sort((p, q) => p.a - q.a);
    spread(slots, (labelW + 12) / r);
    // Each orb takes its ring position when free, else the nearest free spot: a little to
    // either side first, then further out, then further in; so the ring reads as a ring
    // until it is crowded, and a small screen still fits every orb.
    for (const { n, a } of slots) {
      let found = false;
      for (let k = 0; k < 120 && !found; k++) {
        const rr = r + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 10;
        if (rr < MAX_RADIUS) continue;
        for (const turn of TURNS) {
          const angle = a + turn;
          n.x = cx + Math.cos(angle) * rr;
          n.y = cy + Math.sin(angle) * rr;
          if (free(n)) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        n.x = cx + Math.cos(a) * r;
        n.y = cy + Math.sin(a) * r;
      }
      placed.push(n);
    }
  }
  return nodes;
}

/** Offsets tried at each distance, nearest the orb's own angle first. */
const TURNS = [0, 0.1, -0.1, 0.2, -0.2, 0.35, -0.35, 0.5, -0.5, 0.7, -0.7, 1, -1];

/** Pushes neighbours on one ring apart until every gap is at least `minArc`, wrapping round. */
function spread(members: { a: number }[], minArc: number): void {
  const n = members.length;
  if (n < 2) return;
  const fits = Math.min(minArc, (Math.PI * 2) / n);
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = members[i] as { a: number };
      const b = members[(i + 1) % n] as { a: number };
      const gap = i === n - 1 ? b.a + Math.PI * 2 - a.a : b.a - a.a;
      if (gap >= fits - 1e-9) continue;
      const push = (fits - gap) / 2;
      a.a -= push;
      b.a += push;
      moved = true;
    }
    if (!moved) break;
  }
}

/** The node under a point, if any; hit areas are a little larger than the orb. */
export function hit(nodes: SceneNode[], x: number, y: number): SceneNode | undefined {
  let best: SceneNode | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.radius + 8 && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** DOM order for the hidden links: by ring (what needs you first), then title. */
export const domOrder = (nodes: SceneNode[]) =>
  [...nodes].sort((a, b) => a.ring - b.ring || a.title.localeCompare(b.title));
