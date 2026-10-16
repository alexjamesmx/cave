import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import { byRank, dropPatch, rankBetween, rankOf, statusPatch } from "./board.ts";

const NOW = "2026-10-15T10:00";
const task = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection: "tasks",
  data: { _title: id, ...data },
  stamps: {},
  actor: "test",
});

test("cards rank by _order once dragged, else by creation, oldest first", () => {
  const a = task("a", { _created: "2026-10-01T00:00:00Z" });
  const b = task("b", { _created: "2026-10-02T00:00:00Z" });
  const c = task("c", { _created: "2026-10-03T00:00:00Z", _order: rankOf(a) - 5 });
  expect(byRank([b, a, c]).map((d) => d.id)).toEqual(["c", "a", "b"]);
  expect(rankBetween(1, 3)).toBe(2);
  expect(rankBetween(undefined, 3)).toBe(2);
  expect(rankBetween(1, undefined)).toBe(2);
  expect(rankBetween(undefined, undefined)).toBe(0);
});

test("a task's status stamps completed or cancelled, and leaving clears them", () => {
  const open = task("t", { status: "todo" });
  expect(statusPatch(open, "done", NOW)).toEqual({ status: "done", completed: NOW });
  expect(statusPatch(open, "dropped", NOW)).toEqual({ status: "dropped", cancelled: NOW });
  const done = task("t", { status: "done", completed: "2026-10-01T09:00" });
  expect(statusPatch(done, "doing", NOW)).toEqual({ status: "doing", completed: null });
  expect(statusPatch(done, "done", NOW)).toEqual({});
});

test("a drop writes the column's value and an _order between its new neighbours", () => {
  const a = task("a", { status: "todo", _order: 10 });
  const b = task("b", { status: "todo", _order: 20 });
  const moving = task("m", { status: "doing" });
  const base = {
    doc: moving,
    field: "status",
    value: "todo",
    column: [a, b],
    tasks: true,
    now: NOW,
  };
  expect(dropPatch({ ...base, index: 1 })).toEqual({ status: "todo", _order: 15 });
  expect(dropPatch({ ...base, index: 0 })).toEqual({ status: "todo", _order: 9 });
  expect(dropPatch({ ...base, index: 2 })).toEqual({ status: "todo", _order: 21 });
  expect(dropPatch({ ...base, value: "done", column: [], index: 0 })).toEqual({
    status: "done",
    completed: NOW,
    _order: 0,
  });
  // Within one column only the order changes; other boards don't get the task rules.
  expect(dropPatch({ ...base, doc: a, column: [b], index: 1 })).toEqual({ _order: 21 });
  expect(dropPatch({ ...base, tasks: false, value: "done", column: [], index: 0 })).toEqual({
    status: "done",
    _order: 0,
  });
});
