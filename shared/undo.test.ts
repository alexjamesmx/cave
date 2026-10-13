import { expect, test } from "bun:test";
import { formatStamp } from "./hlc.ts";
import type { Change, Doc } from "./types.ts";
import { undoPatch } from "./undo.ts";

const s = (ms: number, device = "agent-x") => formatStamp(ms, 0, device);

const doc = (data: Record<string, unknown>, stamps: Record<string, string>): Doc => ({
  id: "t1",
  kind: "item",
  collection: "tasks",
  data,
  stamps,
  actor: "agent:x",
});

const edit: Change = {
  seq: 7,
  id: "t1",
  actor: "agent:x",
  at: 2,
  keys: ["status", "area"],
  before: { status: { value: "todo", stamp: s(1, "laptop") }, area: null },
  after: { status: s(2), area: s(2) },
};

test("restores before-values; a key that did not exist goes back to null", () => {
  const current = doc({ status: "done", area: "work" }, { status: s(2), area: s(2) });
  expect(undoPatch(edit, current)).toEqual({ patch: { status: "todo", area: null }, skipped: [] });
});

test("a key changed since the agent's write is reported, not overwritten", () => {
  const current = doc({ status: "doing", area: "work" }, { status: s(3, "phone"), area: s(2) });
  expect(undoPatch(edit, current)).toEqual({
    patch: { area: null },
    skipped: [{ key: "status", reason: "changed since" }],
  });
});

test("undoing the change that created a doc deletes it", () => {
  const create: Change = {
    seq: 3,
    id: "t1",
    actor: "agent:x",
    at: 1,
    keys: ["_created", "_title"],
    before: { _created: null, _title: null },
    after: { _created: s(1), _title: s(1) },
  };
  const current = doc({ _created: "x", _title: "Edited" }, { _created: s(1), _title: s(5) });
  expect(undoPatch(create, current)).toEqual({ patch: { _deleted: true }, skipped: [] });
  const gone = doc({ _deleted: true }, { _deleted: s(6) });
  expect(undoPatch(create, gone).skipped).toEqual([
    { key: "_created", reason: "already deleted" },
    { key: "_title", reason: "already deleted" },
  ]);
});

test("rows written before after-stamps were recorded cannot be undone", () => {
  const old: Change = { ...edit, after: null };
  expect(undoPatch(old, doc({}, {}))).toEqual({
    patch: {},
    skipped: [
      { key: "status", reason: "recorded before undo was possible" },
      { key: "area", reason: "recorded before undo was possible" },
    ],
  });
  expect(undoPatch({ ...edit, before: null }, doc({}, {})).patch).toEqual({});
});

test("a missing doc is reported", () => {
  expect(undoPatch(edit, undefined).skipped[0]?.reason).toBe("the item no longer exists");
});
