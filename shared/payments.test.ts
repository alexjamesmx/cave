import { expect, test } from "bun:test";
import {
  expenseFrom,
  groupPayments,
  missingForPayment,
  paidPatch,
  upcomingPayments,
} from "./payments.ts";
import type { Zone } from "./recurrence.ts";
import { completeTask } from "./tasks.ts";

const MX: Zone = { timeZone: "America/Mexico_City", defaultTime: "09:00" };
const NOW = Date.parse("2026-10-15T16:00:00Z"); // Thu 10:00
const item = (data: Record<string, unknown>) => ({ data, stamps: {} });

test("Paid moves a monthly payment to next month, keeps the 31st, and closes a one-off", () => {
  expect(paidPatch(item({ due: "2026-10-22T09:00", repeat: "monthly" }), NOW, MX)).toEqual({
    due: "2026-11-22T09:00",
  });
  // Paid early still advances it one period.
  expect(paidPatch(item({ due: "2026-11-01", repeat: "monthly" }), NOW, MX)).toEqual({
    due: "2026-12-01",
  });
  expect(paidPatch(item({ due: "2026-10-31", repeat: "monthly" }), NOW, MX)).toEqual({
    due: "2026-11-30",
    _repeatFrom: "2026-10-31",
  });
  expect(paidPatch(item({ due: "2026-10-22", repeat: "yearly" }), NOW, MX)).toEqual({
    due: "2027-10-22",
  });
  expect(paidPatch(item({ due: "2026-10-22", repeat: "none" }), NOW, MX)).toEqual({
    active: false,
  });
});

test("the expense a Paid starts from asks for the amount when it varies", () => {
  const card = item({ _title: "Nu", amount: 3000, approx: true, category: "other", account: "Nu" });
  expect(expenseFrom(card)).toEqual({ title: "Nu", category: "other", account: "Nu" });
  expect(expenseFrom(item({ _title: "City Gym", amount: 699 }))).toEqual({
    title: "City Gym",
    amount: 699,
  });
});

test("a repeating task comes back on its next date and stays open; a one-off is done", () => {
  expect(
    completeTask(
      item({ due: "2026-11-01", repeat: "monthly", status: "todo" }),
      NOW,
      MX,
      "2026-10-15T10:00",
    ),
  ).toEqual({ due: "2026-12-01", completed: "2026-10-15T10:00" });
  expect(
    completeTask(item({ due: "2026-10-15", repeat: "weekly", status: "done" }), NOW, MX, "x"),
  ).toEqual({ due: "2026-10-22", completed: "x", status: "todo" });
  // Done from doing or waiting (the board's done column) starts the next one fresh, as todo.
  for (const status of ["doing", "waiting"])
    expect(
      completeTask(item({ due: "2026-10-26", repeat: "monthly", status }), NOW, MX, "x"),
    ).toEqual({ due: "2026-11-26", completed: "x", status: "todo" });
  expect(completeTask(item({ status: "doing" }), NOW, MX, "x")).toEqual({
    status: "done",
    completed: "x",
  });
});

test("upcoming payments: overdue first, then by date, inactive ones out", () => {
  const docs = [
    { id: "later", ...item({ due: "2026-10-30" }) },
    { id: "late", ...item({ due: "2026-10-10" }) },
    { id: "soon", ...item({ due: "2026-10-16" }) },
    { id: "off", ...item({ due: "2026-10-16", active: false }) },
    { id: "far", ...item({ due: "2026-12-30" }) },
  ];
  const to = Date.parse("2026-11-14T06:00:00Z");
  expect(upcomingPayments(docs, NOW, to, MX).map((p) => [p.id, p.overdue])).toEqual([
    ["late", true],
    ["soon", false],
    ["later", false],
  ]);
});

test("payments group as Overdue, This week, Later, Needs date and Inactive, each by due date", () => {
  const p = (id: string, data: Record<string, unknown>) => ({ id, data, stamps: {} });
  const groups = groupPayments(
    [
      p("later", { due: "2026-11-02", active: true }),
      p("iphone", { due: "2026-08-02", active: true }),
      p("week2", { due: "2026-10-20T09:00", active: true }),
      p("week1", { due: "2026-10-16", active: true }),
      p("nodate", { active: true }),
      p("off", { due: "2026-10-16", active: false }),
      p("gone", { due: "2026-10-16", _deleted: true }),
    ],
    NOW,
    MX,
  );
  expect({
    overdue: groups.overdue.map((x) => x.id),
    week: groups.week.map((x) => x.id),
    later: groups.later.map((x) => x.id),
    needsDate: groups.needsDate,
    inactive: groups.inactive,
  }).toEqual({
    overdue: ["iphone"],
    week: ["week1", "week2"],
    later: ["later"],
    needsDate: ["nodate"],
    inactive: ["off"],
  });
});

test("a subscription needs amount, due, repeat and account; other kinds keep needing a due date", () => {
  const base = {
    kind: "subscription",
    amount: "199",
    due: "2026-11-01",
    repeat: "monthly",
    account: "Nu",
  };
  expect(missingForPayment(base)).toEqual([]);
  expect(missingForPayment({ ...base, amount: "", repeat: "none", account: " " })).toEqual([
    "amount",
    "repeat",
    "account",
  ]);
  expect(missingForPayment({ ...base, kind: "bill", amount: "", account: "" })).toEqual([]);
  expect(missingForPayment({ ...base, kind: "card", due: "" })).toEqual(["due date"]);
});
