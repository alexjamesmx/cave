import { expect, test } from "bun:test";
import type { Zone } from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import {
  agenda,
  agendaCounts,
  agendaDone,
  donePatch,
  groupName,
  paidExpense,
  todayTime,
  whenLabel,
} from "./agenda.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const NOW = Date.parse("2026-11-12T16:00:00Z"); // Thu 12, 10:00 local
const TODAY = "2026-11-12";

const doc = (id: string, collection: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection,
  data: { _title: id, ...data },
  stamps: {},
  actor: "test",
});

const reminders = [
  doc("r-late", "reminders", { due: "2026-11-11T18:00" }),
  doc("r-this-morning", "reminders", { due: "2026-11-12T08:00" }),
  doc("r-tonight", "reminders", { due: "2026-11-12T18:00" }),
  doc("r-tomorrow", "reminders", { due: "2026-11-13T20:00", repeat: "weekly" }),
  doc("r-tuesday", "reminders", { due: "2026-11-17" }),
  doc("r-december", "reminders", { due: "2026-12-07" }),
  doc("r-done", "reminders", { due: "2026-11-10", done: true }),
  doc("r-someday", "reminders", {}),
  doc("r-gone", "reminders", { due: "2026-11-12T12:00", _deleted: true }),
];
const tasks = [
  doc("t-late", "tasks", { due: "2026-11-11", status: "todo" }),
  doc("t-this-morning", "tasks", { due: "2026-11-12T08:00", status: "doing" }),
  doc("t-saturday", "tasks", { due: "2026-11-14", status: "waiting" }),
  doc("t-done", "tasks", { due: "2026-11-12", status: "done" }),
  doc("t-dropped", "tasks", { due: "2026-11-12", status: "dropped" }),
  doc("t-undated", "tasks", { status: "todo" }),
];
const payments = [
  doc("p-late", "payments", { due: "2026-11-11T09:00", amount: 500, category: "bills" }),
  doc("p-later", "payments", { due: "2026-11-24T10:00", repeat: "monthly", amount: 99 }),
  doc("p-paused", "payments", { due: "2026-11-12T09:00", active: false }),
  doc("p-undated", "payments", { amount: 10 }),
];

const groups = agenda(reminders, tasks, payments, NOW, MX);
const find = (id: string) =>
  groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.id }))).find((it) => it.id === id);

test("everything with a date, by when, across reminders, tasks and payments", () => {
  expect(groups.map((g) => [g.id, g.items.map((it) => it.id)])).toEqual([
    // Same moment: payments, then tasks, then reminders.
    ["overdue", ["p-late", "t-late", "r-late", "r-this-morning"]],
    ["today", ["t-this-morning", "r-tonight"]],
    ["tomorrow", ["r-tomorrow"]],
    ["week", ["t-saturday", "r-tuesday"]],
    ["later", ["p-later", "r-december"]],
    ["undated", ["r-someday"]],
  ]);
});

test("overdue counts payments and tasks too, so Upcoming and the Agenda agree", () => {
  const counts = agendaCounts(groups);
  expect(counts.overdue).toBe(4);
  expect(counts.today).toBe(2);
  expect(counts.all).toBe(12);
  // A task is overdue once its day has passed; a reminder once its moment has.
  expect(find("t-this-morning")?.group).toBe("today");
  expect(find("r-this-morning")?.group).toBe("overdue");
  expect(agendaCounts([])).toMatchObject({ overdue: 0, all: 0 });
});

test("done keeps dated reminders and tasks, latest first", () => {
  expect(agendaDone(reminders, tasks, MX).map((it) => it.id)).toEqual(["t-done", "r-done"]);
});

test("headings and when labels", () => {
  expect(groupName("today", TODAY)).toBe("Today · Thu 12");
  expect(groupName("week", TODAY)).toBe("This week");
  const when = (id: string) => {
    const it = find(id);
    return it ? whenLabel(it, it.group, TODAY) : undefined;
  };
  expect(when("r-late")).toBe("Wed");
  expect(when("r-this-morning")).toBe("08:00");
  expect(when("r-tonight")).toBe("18:00");
  expect(when("r-tuesday")).toBe("Tue");
  expect(when("r-december")).toBe("Dec 7");
  expect(when("r-someday")).toBe("No date");
  const allDay = agenda([doc("x", "reminders", { due: "2026-11-13" })], [], [], NOW, MX);
  const [first] = allDay[0]?.items ?? [];
  expect(first && whenLabel(first, "tomorrow", TODAY)).toBe("All day");
});

test("✓ completes a reminder or task (a repeat moves on) and moves a payment on", () => {
  const patch = (id: string) => {
    const it = find(id);
    if (!it) throw new Error(id);
    return donePatch(it, NOW, MX);
  };
  expect(patch("r-tonight")).toEqual({ done: true });
  expect(patch("r-tomorrow").due).toBe("2026-11-20T20:00");
  expect(patch("r-tomorrow").done).toBeUndefined();
  expect(patch("t-late")).toEqual({ status: "done", completed: "2026-11-12T10:00" });
  const repeating = agenda(
    [],
    [doc("rent", "tasks", { due: "2026-11-11", status: "doing", repeat: "monthly" })],
    [],
    NOW,
    MX,
  )[0]?.items[0];
  if (!repeating) throw new Error("rent");
  expect(donePatch(repeating, NOW, MX)).toMatchObject({
    due: "2026-12-11",
    status: "todo",
    completed: "2026-11-12T10:00",
  });
  expect(patch("p-late")).toEqual({ active: false });
  expect(patch("p-later").due).toBe("2026-12-24T10:00");
});

test("a payment's expense comes from it, linked; a varying amount is never guessed", () => {
  const late = payments[0] as Doc;
  expect(paidExpense(late, "2026-11-12T10:00")).toEqual({
    _title: "p-late",
    amount: 500,
    direction: "expense",
    date: "2026-11-12T10:00",
    category: "bills",
    payment: "p-late",
  });
  const varies = doc("gas", "payments", { amount: 300, approx: true });
  expect(paidExpense(varies, "2026-11-12T10:00")).toBeUndefined();
  expect(paidExpense(doc("blank", "payments", {}), "2026-11-12T10:00")).toBeUndefined();
});

test("a reminder added for today waits for the reminder time, else the next hour", () => {
  expect(todayTime("09:00", "07:45")).toBe("09:00");
  expect(todayTime("09:00", "09:00")).toBe("10:00");
  expect(todayTime("09:00", "14:20")).toBe("15:00");
  expect(todayTime("09:00", "23:10")).toBe("23:59");
});
