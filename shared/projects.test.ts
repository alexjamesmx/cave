import { expect, test } from "bun:test";
import { validateFields } from "./fields.ts";
import {
  DEFAULT_TEMPLATES,
  newProjectWrites,
  overviewOf,
  partsTree,
  projectRef,
  promoteIdeaWrites,
  templatesOf,
} from "./projects.ts";
import type { Doc } from "./types.ts";

const item = (id: string, collection: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection,
  data,
  stamps: {},
  actor: "user:t",
});

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};

test("a ref must point at a live item of its collection", () => {
  const docs = new Map([
    ["p1", item("p1", "projects", { _title: "P" })],
    ["t1", item("t1", "tasks", { _title: "T" })],
    ["gone", item("gone", "projects", { _deleted: true })],
  ]);
  const check = (value: unknown) =>
    validateFields([projectRef], { project: value }, { refTarget: (id) => docs.get(id) })
      .map((e) => e.error)
      .join();
  expect(check("p1")).toBe("");
  expect(check(null)).toBe("");
  expect(check("missing")).toContain("points to no item in projects");
  expect(check("t1")).toContain("points to an item in tasks, not projects");
  expect(check("gone")).toContain("points to a deleted item");
  expect(check(42)).toContain("must be an item id");
  // Without a lookup (sync), only the shape is checked.
  expect(validateFields([projectRef], { project: "missing" })).toEqual([]);
});

test("a new project gets its template's parts, in order, after the project itself", () => {
  const writes = newProjectWrites(
    { title: "Ship it", template: "software" },
    DEFAULT_TEMPLATES,
    counter(),
  );
  expect(writes.map((w) => [w.id, w.collection, w.patch._title])).toEqual([
    ["id1", "projects", "Ship it"],
    ["id2", "parts", "Plan"],
    ["id3", "parts", "Build"],
    ["id4", "parts", "Ship"],
  ]);
  expect(writes[0]?.patch).toEqual({ _title: "Ship it", status: "active", template: "software" });
  expect(writes[2]?.patch).toMatchObject({ project: "id1", order: 2, status: "planned" });
  expect(
    newProjectWrites({ title: "X", template: "nope" }, DEFAULT_TEMPLATES, counter()),
  ).toHaveLength(1);
});

test("promoting an idea: its body becomes the goal and it points at the new project", () => {
  const idea = item("idea1", "ideas", { _title: "Garden", _body: " Grow tomatoes \n" });
  const writes = promoteIdeaWrites(idea, "goal", DEFAULT_TEMPLATES, counter());
  expect(writes[0]?.patch).toEqual({
    _title: "Garden",
    status: "active",
    template: "goal",
    goal: "Grow tomatoes",
  });
  expect(writes.at(-1)).toEqual({ id: "idea1", collection: "ideas", patch: { project: "id1" } });
});

test("templates from settings: malformed ones are dropped, none at all means the defaults", () => {
  expect(templatesOf(undefined)).toBe(DEFAULT_TEMPLATES);
  expect(templatesOf({ projectTemplates: { bad: { label: 1 } } })).toBe(DEFAULT_TEMPLATES);
  const t = templatesOf({
    projectTemplates: {
      mine: { label: "Mine", collections: ["tasks", 3], widgets: ["counts", "nope"] },
    },
  });
  expect(t).toEqual({
    mine: { label: "Mine", parts: [], collections: ["tasks"], widgets: ["counts"] },
  });
});

test("the parts tree nests children under live parents; orphans become roots", () => {
  const tree = partsTree([
    item("b", "parts", { _title: "B", order: 2 }),
    item("a", "parts", { _title: "A", order: 1 }),
    item("a1", "parts", { _title: "A1", parent: "a" }),
    item("x1", "parts", { _title: "X1", parent: "deleted-parent" }),
    item("d", "parts", { _title: "D", _deleted: true }),
  ]);
  const shape = (nodes: typeof tree): unknown[] => nodes.map((n) => [n.doc.id, shape(n.children)]);
  expect(shape(tree)).toEqual([
    ["a", [["a1", []]]],
    ["b", []],
    ["x1", []],
  ]);
});

test("an overview counts only the project's items, and its budget leaves transfers out", () => {
  const p = "p1";
  const items: Record<string, Doc[]> = {
    parts: [
      item("pa", "parts", { project: p, status: "done" }),
      item("pb", "parts", { project: p, status: "active", due: "2026-11-02", _title: "Beta" }),
      item("pc", "parts", { project: p, status: "dropped" }),
      item("other", "parts", { project: "p2", status: "done" }),
    ],
    tasks: [
      item("t1", "tasks", { project: p, status: "todo", due: "2026-10-20", _title: "First" }),
      item("t2", "tasks", { project: p, status: "done", due: "2026-10-01" }),
      item("t3", "tasks", { project: "p2", status: "todo" }),
    ],
    money: [
      item("m1", "money", { project: p, direction: "expense", amount: 100, category: "food" }),
      item("m2", "money", { project: p, direction: "expense", amount: 900, category: "invest" }),
      item("m3", "money", { project: p, direction: "income", amount: 50 }),
    ],
    leetcode: [
      item("l1", "leetcode", { project: p, status: "solved" }),
      item("l2", "leetcode", { project: p, status: "queued" }),
    ],
  };
  const itemsOf = (c: string) => items[c] ?? [];
  const generic = overviewOf(p, DEFAULT_TEMPLATES.generic, itemsOf, new Set(["invest"]));
  expect(generic.progress).toEqual({ done: 1, total: 2, of: "parts" });
  expect(generic.budget).toEqual({ spent: 100, count: 1 });
  expect(generic.tasks).toEqual([
    { status: "todo", count: 1 },
    { status: "done", count: 1 },
  ]);
  expect(generic.upcoming.map((u) => [u.title, u.kind])).toEqual([
    ["First", "task"],
    ["Beta", "part"],
  ]);
  expect(generic.counts).toEqual([
    { collection: "tasks", count: 2 },
    { collection: "ideas", count: 0 },
  ]);
  const learning = overviewOf(p, DEFAULT_TEMPLATES.learning, itemsOf, new Set());
  expect(learning.progress).toEqual({ done: 1, total: 2, of: "leetcode" });
});
