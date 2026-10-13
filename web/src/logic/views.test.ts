import { expect, test } from "bun:test";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { doneInLast, entriesByDay, streak } from "./habits.ts";
import { leetcodeProgress } from "./progress.ts";
import { applyFilter, defaultSort, groupBy, readFilter } from "./views.ts";
import { wealthSummary } from "./wealth.ts";

let n = 0;
const doc = (data: Record<string, unknown>): Doc => ({
  id: `d${n++}`,
  kind: "item",
  collection: "c",
  data,
  stamps: {},
  actor: "import",
});

const status: Field = {
  id: "status",
  name: "Status",
  type: "select",
  options: [
    { value: "todo", icon: "circle", color: "#fff" },
    { value: "done", icon: "check", color: "#fff" },
  ],
};

test("the untagged filter keeps missing, null and empty values", () => {
  const docs = [doc({ category: "food" }), doc({}), doc({ category: null }), doc({ category: "" })];
  const filter = readFilter({ filter: { field: "category", op: "empty" } });
  expect(applyFilter(docs, filter)).toHaveLength(3);
  expect(readFilter({ filter: { field: "x", op: "drop" } })).toBeUndefined();
});

test("groups follow option order and collect unknown values under no value", () => {
  const groups = groupBy([doc({ status: "done" }), doc({ status: "gone" }), doc({})], status);
  expect(groups.map((g) => [g.value, g.docs.length])).toEqual([
    ["todo", 0],
    ["done", 1],
    [null, 2],
  ]);
});

test("default sort is newest first by the first date field", () => {
  const fields: Field[] = [{ id: "due", name: "Due", type: "date" }];
  const sorted = defaultSort([doc({ due: "2026-01-01" }), doc({ due: "2026-10-01" })], fields);
  expect(sorted.map((d) => d.data.due)).toEqual(["2026-10-01", "2026-01-01"]);
});

test("wealth subtracts debt whatever its sign and lists rows without a value", () => {
  const s = wealthSummary([
    doc({ type: "stocks", value: 1000 }),
    doc({ type: "debt", value: -300 }),
    doc({ type: "house" }),
  ]);
  expect([s.assets, s.debt, s.net]).toEqual([1000, 300, 700]);
  expect(s.missingValue).toHaveLength(1);
});

test("habit streaks count back from today, or from yesterday when today is not logged", () => {
  const byDay = entriesByDay([
    doc({ date: "2026-10-10", gym: true }),
    doc({ date: "2026-10-11", gym: true }),
    doc({ date: "2026-10-09", gym: false }),
  ]);
  expect(streak(byDay, "gym", "2026-10-12")).toBe(2);
  expect(streak(byDay, "gym", "2026-10-11")).toBe(2);
  expect(streak(byDay, "gym", "2026-10-14")).toBe(0);
  expect(doneInLast(byDay, "gym", "2026-10-12", 7)).toBe(2);
});

test("leetcode progress per status and difficulty", () => {
  const p = leetcodeProgress(
    [
      doc({ status: "solved", difficulty: "easy", solved_at: "2026-10-01" }),
      doc({ status: "queued", difficulty: "easy" }),
      doc({ status: "solved", difficulty: "medium", solved_at: "2026-10-05" }),
    ],
    ["easy", "medium", "hard"],
  );
  expect(p.byDifficulty).toEqual([
    { difficulty: "easy", solved: 1, total: 2 },
    { difficulty: "medium", solved: 1, total: 1 },
    { difficulty: "hard", solved: 0, total: 0 },
  ]);
  expect(p.recentlySolved.map((d) => d.data.solved_at)).toEqual(["2026-10-05", "2026-10-01"]);
});
