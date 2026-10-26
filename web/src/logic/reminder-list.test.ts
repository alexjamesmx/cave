import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import {
  dayLabel,
  reminderList,
  reminderQueryFromSearch,
  reminderQueryToSearch,
} from "./reminder-list.ts";

const zone = { timeZone: "UTC", defaultTime: "09:00" };
const NOW = Date.parse("2026-10-15T10:00:00Z");
const r = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection: "reminders",
  data: { _title: id, ...data },
  stamps: {},
  actor: "user",
});
const items = [
  r("late", { due: "2026-10-14T09:00" }),
  r("soon", { due: "2026-10-16T08:00" }),
  r("later", { due: "2026-10-16T18:00", repeat: "monthly" }),
  r("paid", { due: "2026-10-01", done: true }),
  r("someday", {}),
  r("gone", { due: "2026-10-20", _deleted: true }),
];
const list = (q: Partial<Parameters<typeof reminderList>[1]>) =>
  reminderList(items, { chip: "upcoming", repeat: "", text: "", ...q }, NOW, zone);
const ids = (q: Partial<Parameters<typeof reminderList>[1]>) =>
  list(q).groups.map((g) => [g.key, g.rows.map((d) => d.id)]);

test("chips: upcoming soonest first with no date last; overdue; done; all latest first; counts per chip", () => {
  expect(ids({})).toEqual([
    ["2026-10-16", ["soon", "later"]],
    ["", ["someday"]],
  ]);
  expect(ids({ chip: "overdue" })).toEqual([["2026-10-14", ["late"]]]);
  expect(ids({ chip: "done" })).toEqual([["2026-10-01", ["paid"]]]);
  expect(ids({ chip: "all" })).toEqual([
    ["2026-10-16", ["later", "soon"]],
    ["2026-10-14", ["late"]],
    ["2026-10-01", ["paid"]],
    ["", ["someday"]],
  ]);
  expect(list({}).counts).toEqual({ upcoming: 3, overdue: 1, done: 1, all: 5 });
});

test("repeat and text narrow every chip and its count", () => {
  expect(ids({ repeat: "monthly" })).toEqual([["2026-10-16", ["later"]]]);
  expect(list({ repeat: "monthly" }).counts.all).toBe(1);
  expect(ids({ chip: "all", text: "LATE" })).toEqual([
    ["2026-10-16", ["later"]],
    ["2026-10-14", ["late"]],
  ]);
});

test("day labels", () => {
  expect(dayLabel("2026-10-15", "2026-10-15")).toBe("Today");
  expect(dayLabel("2026-10-16", "2026-10-15")).toBe("Tomorrow");
  expect(dayLabel("2026-10-14", "2026-10-15")).toBe("Yesterday");
  expect(dayLabel("2026-11-02", "2026-10-15")).toBe("Nov 2");
  expect(dayLabel("2027-01-02", "2026-10-15")).toBe("Jan 2 2027");
  expect(dayLabel("", "2026-10-15")).toBe("No date");
});

test("the query round-trips through the address; defaults stay out of it", () => {
  expect(reminderQueryFromSearch("")).toEqual({ chip: "upcoming", repeat: "", text: "" });
  expect(reminderQueryToSearch({ chip: "upcoming", repeat: "", text: "" })).toBe("");
  const q = { chip: "done" as const, repeat: "weekly" as const, text: "gym" };
  expect(reminderQueryFromSearch(reminderQueryToSearch(q))).toEqual(q);
  expect(reminderQueryFromSearch("?chip=nope&repeat=hourly")).toEqual({
    chip: "upcoming",
    repeat: "",
    text: "",
  });
});
