import { expect, test } from "bun:test";
import { EMPTY_MAP } from "../../../shared/project-map.ts";
import type { Doc } from "../../../shared/types.ts";
import { buildGraph, localId, moved } from "./map-graph.ts";

const item = (id: string, collection: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection,
  data,
  stamps: {},
  actor: "user:t",
});

test("cards for parts, tasks and items; contains edges from parts; the owner's edges; notes and frames", () => {
  const parts = [
    item("p2", "parts", { _title: "Ship", order: 2, status: "planned" }),
    item("p1", "parts", { _title: "Build", order: 1, status: "active" }),
  ];
  const tasks = [item("t1", "tasks", { _title: "Tests", part: "p1", status: "todo" })];
  const { nodes, edges } = buildGraph(parts, tasks, [item("i1", "ideas", { _title: "Idea" })], {
    ...EMPTY_MAP,
    positions: { p1: { x: 0, y: 0 }, p2: { x: 300, y: 0 } },
    notes: [{ id: "n1", text: "hi", x: 5, y: 5 }],
    groups: [{ id: "g1", title: "Now", x: 0, y: 0, w: 400, h: 300 }],
    edges: [{ id: "e1", from: "p2", to: "p1" }],
  });
  expect(nodes.map((n) => [n.id, n.type])).toEqual([
    ["g1", "frame"],
    ["p1", "card"],
    ["p2", "card"],
    ["t1", "card"],
    ["i1", "card"],
    ["n1", "note"],
  ]);
  expect(nodes.find((n) => n.id === "t1")?.data).toMatchObject({ kind: "task", status: "todo" });
  expect(nodes.filter((n) => n.type === "card").every((n) => n.deletable === false)).toBe(true);
  expect(edges.map((e) => [e.id, e.source, e.target])).toEqual([
    ["contains-t1", "p1", "t1"],
    ["e1", "p2", "p1"],
  ]);
});

test("moving a note or frame changes its own place; an item's goes into positions, rounded", () => {
  const map = { ...EMPTY_MAP, notes: [{ id: "n1", text: "", x: 0, y: 0 }] };
  expect(moved(map, "n1", { x: 10.4, y: 2.6 }).notes[0]).toMatchObject({ x: 10, y: 3 });
  expect(moved(map, "p1", { x: 1, y: 2 }).positions).toEqual({ p1: { x: 1, y: 2 } });
  expect(localId("n", new Set(["n1", "n2"]))).toBe("n3");
});
