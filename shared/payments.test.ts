import { expect, test } from "bun:test";
import { expenseFrom, paidPatch, upcomingPayments } from "./payments.ts";
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
