import { expect, test } from "bun:test";
import type { ProjectState } from "../../../shared/project-status.ts";
import {
  angleOf,
  boxOf,
  domOrder,
  hit,
  layout,
  overlaps,
  radiusFor,
  ringOf,
  type SceneInput,
} from "./layout.ts";

const STATES: ProjectState[] = ["on-track", "blocked", "waiting", "slipping", "paused"];

const inputs = (n: number): SceneInput[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `01M5PE58DJMM51CJ7ER537FX${String(i).padStart(2, "0")}`,
    title: `Project ${i}`,
    line: "on track",
    state: STATES[i % STATES.length] as ProjectState,
    activity: (i * 7) % 25,
    agent: i % 3 === 0,
  }));

test("radius maps activity by the square root; rings follow the state", () => {
  expect(radiusFor(0)).toBe(14);
  expect(radiusFor(20)).toBe(34);
  expect(radiusFor(40)).toBe(34);
  expect(radiusFor(5)).toBeCloseTo(24, 0);
  expect(radiusFor(0, true)).toBe(26);
  expect(STATES.map(ringOf)).toEqual([2, 0, 0, 1, 3]);
  expect(ringOf("done")).toBe(2);
});

test("the angle comes from the id alone, and spreads", () => {
  expect(angleOf("abc")).toBe(angleOf("abc"));
  expect(angleOf("abc")).not.toBe(angleOf("abd"));
  for (const id of ["a", "proj-cave", "01M5PE58DJMM51CJ7ER537FXWJ"]) {
    expect(angleOf(id)).toBeGreaterThanOrEqual(0);
    expect(angleOf(id)).toBeLessThan(Math.PI * 2);
  }
});

test("layout is deterministic and independent of input order", () => {
  const list = inputs(12);
  const a = layout(list, 1200, 700);
  const b = layout([...list].reverse(), 1200, 700);
  expect(a).toEqual(layout(list, 1200, 700));
  expect(a.map((n) => [n.id, n.x, n.y])).toEqual(b.map((n) => [n.id, n.x, n.y]));
  // Every orb lands inside the area.
  for (const n of a) {
    expect(n.x).toBeGreaterThan(0);
    expect(n.x).toBeLessThan(1200);
    expect(n.y).toBeGreaterThan(0);
    expect(n.y).toBeLessThan(700);
  }
});

test("no two labels overlap for 1, 6 and 30 projects, and nothing covers the centre", () => {
  for (const [n, w, h] of [
    [1, 900, 500],
    [6, 1100, 640],
    [30, 1300, 820],
  ] as const) {
    const nodes = layout(inputs(n), w, h);
    expect(nodes).toHaveLength(n);
    for (const [a, b] of pairs(nodes))
      expect([n, a.id, b.id, overlaps(boxOf(a), boxOf(b))]).toEqual([n, a.id, b.id, false]);
    for (const node of nodes)
      expect(Math.hypot(node.x - w / 2, node.y - h / 2)).toBeGreaterThan(70);
  }
  // Compact (phone): bigger orbs, no label box under them, still apart.
  const phone = layout(inputs(6), 360, 520, { compact: true });
  for (const node of phone) expect(node.radius).toBeGreaterThanOrEqual(26);
  for (const [a, b] of pairs(phone))
    expect(overlaps(boxOf(a, { compact: true }), boxOf(b, { compact: true }))).toBe(false);
});

const pairs = <T>(list: T[]) =>
  list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b] as const));

test("paused orbs are dim; hit finds the orb under a point; DOM order is ring then title", () => {
  const nodes = layout(inputs(5), 1000, 600);
  const paused = nodes.find((n) => n.state === "paused");
  expect(paused?.opacity).toBe(0.55);
  expect(nodes.find((n) => n.state === "on-track")?.opacity).toBe(1);
  const first = nodes[0];
  if (!first) throw new Error("no nodes");
  expect(hit(nodes, first.x + 3, first.y - 3)?.id).toBe(first.id);
  expect(hit(nodes, -500, -500)).toBeUndefined();
  const order = domOrder(nodes);
  expect(order.map((n) => n.ring)).toEqual([...order.map((n) => n.ring)].sort((a, b) => a - b));
});
