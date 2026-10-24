import { expect, test } from "bun:test";
import { validateFields } from "./fields.ts";
import {
  autoLayout,
  EMPTY_MAP,
  MAP_FIELD,
  MAP_LIMITS,
  mapMigration,
  type ProjectMap,
  parseMap,
  pruneMap,
} from "./project-map.ts";
import type { Doc } from "./types.ts";

const item = (id: string, collection: string, data: Record<string, unknown> = {}): Doc => ({
  id,
  kind: "item",
  collection,
  data,
  stamps: {},
  actor: "user:t",
});

const map = (over: Partial<ProjectMap> = {}): ProjectMap => ({ ...EMPTY_MAP, ...over });

test("a valid map passes, through the field check too", () => {
  const ok = map({
    positions: { "part-cave-m8": { x: 0, y: 0 }, "part-cave-m9": { x: 300, y: 0 } },
    notes: [{ id: "n1", text: "Ship the map", x: 10, y: 200 }],
    groups: [{ id: "g1", title: "Now", x: -20, y: -20, w: 640, h: 300 }],
    edges: [{ id: "e1", from: "part-cave-m8", to: "part-cave-m9" }],
  });
  expect(parseMap(ok)).toEqual({ ok: true, map: ok });
  expect(validateFields([MAP_FIELD], { map: ok })).toEqual([]);
});

test("a map is refused for HTML, unknown edge ends, bad ids, size and shape", () => {
  const error = (m: unknown) => {
    const parsed = parseMap(m);
    return parsed.ok ? "ok" : parsed.error;
  };
  expect(error({ version: 2 })).toBe("must be a map with version 1");
  expect(
    error(map({ notes: [{ id: "n1", text: "<img src=x onerror=alert(1)>", x: 0, y: 0 }] })),
  ).toBe("note n1 must be plain text, not HTML");
  expect(
    error(map({ notes: [{ id: "n1", text: "x".repeat(MAP_LIMITS.text + 1), x: 0, y: 0 }] })),
  ).toContain("longer than");
  expect(error(map({ edges: [{ id: "e1", from: "a", to: "b" }] }))).toBe(
    "edge e1 joins a node the map doesn't place",
  );
  expect(error(map({ positions: { "bad id!": { x: 0, y: 0 } } }))).toBe(
    "position bad id! is not a node id",
  );
  expect(error(map({ positions: { a: { x: Number.NaN, y: 0 } } }))).toBe(
    "position a needs x and y",
  );
  const many = Object.fromEntries(
    Array.from({ length: MAP_LIMITS.nodes + 1 }, (_, i) => [`n${i}`, { x: 0, y: 0 }]),
  );
  expect(error(map({ positions: many }))).toContain("more than");
  // Less-than in ordinary text is fine.
  expect(error(map({ notes: [{ id: "n1", text: "cost < 3 days", x: 0, y: 0 }] }))).toBe("ok");
  expect(validateFields([MAP_FIELD], { map: { version: 2 } })[0]?.error).toBe(
    "is not a valid map: must be a map with version 1",
  );
});

test("auto layout: parts in columns by status, tasks under their part, the rest last; stored positions win", () => {
  const parts = [
    item("p-plan", "parts", { status: "done" }),
    item("p-build", "parts", { status: "active" }),
  ];
  const tasks = [item("t1", "tasks", { part: "p-build" }), item("t2", "tasks")];
  const idea = item("i1", "ideas");
  const auto = autoLayout(parts, tasks, [idea], {});
  expect(auto["p-build"]).toEqual({ x: 0, y: 0 });
  expect(auto.t1).toEqual({ x: 24, y: 110 });
  expect(auto["p-plan"]).toEqual({ x: 300, y: 0 });
  expect([auto.t2, auto.i1]).toEqual([
    { x: 600, y: 0 },
    { x: 600, y: 88 },
  ]);
  // An item added later gets a spot; what the owner arranged stays where it was.
  const later = autoLayout(parts, [...tasks, item("t3", "tasks", { part: "p-build" })], [idea], {
    "p-build": { x: 999, y: 999 },
  });
  expect(later["p-build"]).toEqual({ x: 999, y: 999 });
  expect(later.t3).toBeDefined();
});

test("pruning drops positions and edges of items that are gone, keeping notes and groups", () => {
  const m = map({
    positions: { a: { x: 0, y: 0 }, gone: { x: 1, y: 1 } },
    notes: [{ id: "n1", text: "x", x: 0, y: 0 }],
    edges: [
      { id: "e1", from: "a", to: "gone" },
      { id: "e2", from: "a", to: "n1" },
    ],
  });
  expect(pruneMap(m, new Set(["a"]))).toEqual({
    ...m,
    positions: { a: { x: 0, y: 0 } },
    edges: [{ id: "e2", from: "a", to: "n1" }],
  });
});

test("seed migration 12 adds the map field once", () => {
  const projects = {
    id: "projects",
    kind: "collection" as const,
    collection: null,
    data: { fields: [{ id: "status", name: "Status", type: "select" }] },
    stamps: {},
    actor: "seed",
  };
  const [out] = mapMigration(() => projects);
  expect((out?.data.fields as unknown[] | undefined)?.at(-1)).toEqual(MAP_FIELD);
  expect(mapMigration(() => ({ ...projects, data: out?.data ?? {} }))).toEqual([]);
});

test("shapes (M11 part 6): a kind, text and a box; edges may join them; old maps parse without any", () => {
  const shape = { id: "s1", kind: "diamond" as const, text: "Ready?", x: 0, y: 0, w: 160, h: 90 };
  const m = map({
    shapes: [shape],
    edges: [{ id: "e1", from: "s1", to: "n1" }],
    notes: [{ id: "n1", text: "x", x: 0, y: 0 }],
  });
  expect(parseMap(m)).toEqual({ ok: true, map: m });
  const error = (v: unknown) => {
    const parsed = parseMap(v);
    return parsed.ok ? "ok" : parsed.error;
  };
  expect(error(map({ shapes: [{ ...shape, kind: "star" as "rect" }] }))).toBe(
    "shape s1 must be one of: rect, rounded, diamond",
  );
  expect(error(map({ shapes: [{ ...shape, text: "<b>x</b>" }] }))).toBe(
    "shape s1 must be plain text, not HTML",
  );
  expect(error(map({ shapes: [{ ...shape, w: 0 }] }))).toBe("shape s1 needs x, y, w and h");
  // A map stored before shapes existed.
  const { shapes: _, ...old } = EMPTY_MAP;
  const parsed = parseMap(old);
  expect(parsed.ok && parsed.map.shapes).toEqual([]);
  // Pruning keeps shapes and the edges that use them.
  expect(pruneMap(m, new Set())).toEqual(m);
});
