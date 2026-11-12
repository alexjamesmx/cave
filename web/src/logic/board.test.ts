import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import {
  byRank,
  columnName,
  dropIndex,
  dropPatch,
  dueLabel,
  rankBetween,
  rankOf,
  statusPatch,
} from "./board.ts";

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

test("a drop lands before the first card whose middle is below it, else at the end", () => {
  // Two cards, 100 to 160 and 170 to 230 down the screen.
  const cards = [
    { top: 100, height: 60 },
    { top: 170, height: 60 },
  ];
  expect(dropIndex(cards, 90)).toBe(0);
  expect(dropIndex(cards, 129)).toBe(0);
  expect(dropIndex(cards, 131)).toBe(1);
  expect(dropIndex(cards, 199)).toBe(1);
  // Below the last card's middle, and far down the column's empty area: the end.
  expect(dropIndex(cards, 201)).toBe(2);
  expect(dropIndex(cards, 800)).toBe(2);
  // An empty column takes the card anywhere.
  expect(dropIndex([], 40)).toBe(0);
  expect(dropIndex([], 800)).toBe(0);
});

test("a drop on a short column's empty area appends; within one column it only reorders", () => {
  const a = task("a", { status: "waiting", _order: 10 });
  const b = task("b", { status: "waiting", _order: 20 });
  const moving = task("m", { status: "todo", _order: 5 });
  const boxes = [
    { top: 100, height: 60 },
    { top: 170, height: 60 },
  ];
  const drop = { field: "status", value: "waiting", tasks: true, now: NOW };
  expect(dropPatch({ ...drop, doc: moving, column: [a, b], index: dropIndex(boxes, 640) })).toEqual(
    { status: "waiting", _order: 21 },
  );
  // `b` dropped above `a` in its own column.
  expect(dropPatch({ ...drop, doc: b, column: [a], index: dropIndex(boxes, 105) })).toEqual({
    _order: 9,
  });
});

test("column names read as words; an owner's label wins", () => {
  expect(columnName({ value: "todo" })).toBe("To do");
  expect(columnName({ value: "waiting" })).toBe("Waiting");
  expect(columnName({ value: "todo", label: "Backlog" })).toBe("Backlog");
});

test("due dates read relative to today", () => {
  const today = "2026-11-12"; // a Thursday
  expect(dueLabel("2026-11-11", today)).toEqual({ text: "Overdue · 1 day", tone: "bad" });
  expect(dueLabel("2026-11-09T08:00", today)).toEqual({ text: "Overdue · 3 days", tone: "bad" });
  expect(dueLabel("2026-11-12T17:00", today)).toEqual({ text: "Today · 17:00", tone: "warn" });
  expect(dueLabel("2026-11-12", today)).toEqual({ text: "Today", tone: "warn" });
  expect(dueLabel("2026-11-13", today).text).toBe("Tomorrow");
  expect(dueLabel("2026-11-14T08:00", today).text).toBe("Sat 14 · 08:00");
  expect(dueLabel("2026-11-22T10:00", today).text).toBe("Sun 22 · 10:00");
  expect(dueLabel("2026-12-07", today).text).toBe("Dec 7");
  expect(dueLabel("2027-01-04", today).text).toBe("Jan 4 2027");
  expect(dueLabel(undefined, today)).toEqual({ text: "No date", tone: "plain" });
});
