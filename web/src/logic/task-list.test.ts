import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import { taskList, taskQueryFromSearch, taskQueryToSearch } from "./task-list.ts";

const t = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection: "tasks",
  data: { _title: id, ...data },
  stamps: {},
  actor: "user",
});
const items = [
  t("later", { status: "todo", due: "2026-10-20" }),
  t("soon", { status: "doing", due: "2026-10-16" }),
  t("urgent", { status: "waiting", due: "2026-10-20", priority: "high" }),
  t("whenever", { status: "todo" }),
  t("shipped", { status: "done", completed: "2026-10-10T10:00" }),
  t("old win", { status: "done", completed: "2026-09-01T10:00" }),
  t("skipped", { status: "dropped", cancelled: "2026-10-02T10:00" }),
  t("gone", { status: "todo", _deleted: true }),
];
const ids = (chip: Parameters<typeof taskList>[1], text = "") =>
  taskList(items, chip, text).rows.map((d) => d.id);

test("open by due date then priority, no date last; done latest first; counts per chip", () => {
  expect(ids("open")).toEqual(["soon", "urgent", "later", "whenever"]);
  expect(ids("done")).toEqual(["shipped", "old win"]);
  expect(ids("dropped")).toEqual(["skipped"]);
  expect(ids("all")).toHaveLength(7);
  expect(taskList(items, "open", "").counts).toEqual({ open: 4, done: 2, dropped: 1, all: 7 });
});

test("search narrows every chip and its count", () => {
  expect(ids("open", "SOON")).toEqual(["soon"]);
  expect(taskList(items, "open", "win").counts).toEqual({ open: 0, done: 1, dropped: 0, all: 1 });
});

test("the query round-trips; defaults stay out of the address", () => {
  expect(taskQueryFromSearch("")).toEqual({ chip: "open", text: "" });
  expect(taskQueryToSearch({ chip: "open", text: "" })).toBe("");
  expect(taskQueryFromSearch(taskQueryToSearch({ chip: "done", text: "gym" }))).toEqual({
    chip: "done",
    text: "gym",
  });
  expect(taskQueryFromSearch("?chip=nope").chip).toBe("open");
});
