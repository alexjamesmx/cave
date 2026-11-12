import { expect, test } from "bun:test";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import {
  canStepForward,
  dayLabel,
  type LedgerQuery,
  ledger,
  matchesSearch,
  queryFromSearch,
  queryToSearch,
  switchScope,
} from "./ledger.ts";

const category: Field = {
  id: "category",
  name: "Category",
  type: "select",
  options: [
    { value: "food", icon: "tag", color: "#000", label: "Food", emoji: "🍔", kind: "expense" },
    { value: "health", icon: "tag", color: "#000", label: "Health & gym", kind: "expense" },
    { value: "salary", icon: "tag", color: "#000", label: "Salary", kind: "income" },
    { value: "invest", icon: "tag", color: "#000", label: "Investment", kind: "transfer" },
  ],
};
const account: Field = {
  id: "account",
  name: "Account",
  type: "select",
  options: [
    { value: "bank", icon: "landmark", color: "#000", label: "Blue bank" },
    { value: "old", icon: "landmark", color: "#000", archived: true },
  ],
};
const fields = { category, account };

let n = 0;
const doc = (data: Record<string, unknown>): Doc => ({
  id: `d${++n}`,
  kind: "item",
  collection: "money",
  data,
  stamps: {},
  actor: "",
});

const TODAY = "2026-10-20";
const docs = [
  doc({
    _title: "Tacos",
    amount: 120,
    direction: "expense",
    category: "food",
    date: "2026-10-03T13:00",
    account: "bank",
  }),
  doc({
    _title: "Café",
    amount: 60,
    direction: "expense",
    category: "food",
    date: "2026-10-03T09:00",
    account: "bank",
  }),
  doc({
    _title: "Pay",
    amount: 30000,
    direction: "income",
    category: "salary",
    date: "2026-10-01T09:00",
    account: "bank",
  }),
  doc({
    _title: "Broker",
    amount: 5000,
    direction: "expense",
    category: "invest",
    date: "2026-10-05T09:00",
    account: "bank",
  }),
  doc({ _title: "Mystery", amount: 90, direction: "expense", date: "2026-10-04T09:00" }),
  doc({
    _title: "Renamed away",
    amount: 15,
    direction: "expense",
    category: "gone",
    date: "2026-10-04T10:00",
    account: "bank",
  }),
  doc({
    _title: "No account",
    amount: 33,
    direction: "expense",
    category: "food",
    date: "2026-10-04T11:00",
  }),
  doc({
    _title: "Gym",
    amount: 1225,
    direction: "expense",
    category: "health",
    date: "2026-09-20T10:00",
    account: "old",
    _body: "Yearly plan, paid upfront",
  }),
  doc({
    _title: "Planned",
    amount: 400,
    direction: "expense",
    category: "food",
    date: "2026-11-02T10:00",
    account: "bank",
  }),
  doc({
    _title: "Last year",
    amount: 70,
    direction: "expense",
    category: "food",
    date: "2025-12-30T10:00",
    account: "bank",
  }),
  doc({ _title: "No date", amount: 77, direction: "expense", category: "food", account: "bank" }),
];

const base: LedgerQuery = { month: "2026-10", chip: "all", text: "", category: "" };
const titles = (l: ReturnType<typeof ledger>) =>
  l.days.flatMap((d) => d.rows.map((r) => r.data._title));

test("a month, grouped by day newest first, with each day's in and out and the totals; undated apart", () => {
  const l = ledger(docs, base, category, account, TODAY);
  expect(l.undated.map((d) => d.data._title)).toEqual(["No date"]);
  expect(l.days.map((d) => [d.day, d.rows.length, d.out, d.in])).toEqual([
    ["2026-10-05", 1, 0, 0],
    ["2026-10-04", 3, 138, 0],
    ["2026-10-03", 2, 180, 0],
    ["2026-10-01", 1, 0, 30000],
  ]);
  expect(l.totals).toEqual({
    in: 30000,
    out: 318,
    transferred: 5000,
    count: 7,
    inCount: 1,
    outCount: 5,
    inCategories: ["salary"],
  });
});

test("chips: Expenses leave transfers out; To review is no category, an unknown one, or no account", () => {
  const expenses = ledger(docs, { ...base, chip: "expense" }, category, account, TODAY);
  expect(titles(expenses)).not.toContain("Broker");
  expect(titles(ledger(docs, base, category, account, TODAY))).toContain("Broker");
  const review = ledger(docs, { ...base, chip: "review" }, category, account, TODAY);
  expect(titles(review)).toEqual(["No account", "Renamed away", "Mystery"]);
  const income = ledger(docs, { ...base, chip: "income" }, category, account, TODAY);
  expect(income.totals.in).toBe(30000);
  expect(income.totals.count).toBe(1);
});

test("a year runs from 1 January up to today: other years and what is only planned stay out", () => {
  const year = ledger(docs, { ...base, month: "2026" }, category, account, TODAY);
  expect(titles(year)).toContain("Gym");
  expect(titles(year)).toContain("Tacos");
  expect(titles(year)).not.toContain("Planned");
  expect(titles(year)).not.toContain("Last year");
  const past = ledger(docs, { ...base, month: "2025" }, category, account, TODAY);
  expect(titles(past)).toEqual(["Last year"]);
});

test("search: amounts with or without $ and commas, category and account names, the note, accents", () => {
  const gym = docs.find((d) => d.data._title === "Gym") as Doc;
  for (const q of ["1225", "1,225", "$1225", "$1,225"])
    expect(matchesSearch(gym, fields, q)).toBe(true);
  expect(matchesSearch(gym, fields, "122")).toBe(false);
  expect(matchesSearch(gym, fields, "health")).toBe(true);
  expect(matchesSearch(gym, fields, "HEALTH & GYM")).toBe(true);
  expect(matchesSearch(gym, fields, "upfront")).toBe(true);
  expect(matchesSearch(gym, fields, "old")).toBe(true);
  const tacos = docs.find((d) => d.data._title === "Tacos") as Doc;
  expect(matchesSearch(tacos, fields, "blue bank")).toBe(true);
  expect(matchesSearch(tacos, fields, "food 120")).toBe(true);
  expect(matchesSearch(tacos, fields, "food 121")).toBe(false);
  const cafe = docs.find((d) => d.data._title === "Café") as Doc;
  expect(matchesSearch(cafe, fields, "cafe")).toBe(true);
  expect(matchesSearch(cafe, fields, "  ")).toBe(true);
});

test("a search in a year scope finds the whole year, not only the month", () => {
  const month = ledger(docs, { ...base, text: "health" }, category, account, TODAY);
  expect(month.totals.count).toBe(0);
  const year = ledger(docs, { ...base, month: "2026", text: "health" }, category, account, TODAY);
  expect(titles(year)).toEqual(["Gym"]);
  expect(year.totals.out).toBe(1225);
});

test("a category from Overview's link keeps only its entries", () => {
  const food = ledger(docs, { ...base, category: "food" }, category, account, TODAY);
  expect(titles(food)).toEqual(["No account", "Tacos", "Café"]);
});

test("the query round-trips through the URL, a year included; defaults are left out", () => {
  expect(queryToSearch(base, "2026-10")).toBe("");
  const q: LedgerQuery = { month: "2026", chip: "review", text: "ta", category: "food" };
  const s = queryToSearch(q, "2026-10");
  expect(s).toBe("?month=2026&chip=review&q=ta&category=food");
  expect(queryFromSearch(s, "2026-10")).toEqual(q);
  expect(queryFromSearch("?month=all&chip=uncategorized&group=y", "2026-10")).toEqual(base);
});

test("scope steps stop at this month or year; Month and Year keep the year", () => {
  expect(canStepForward("2026-09", "2026-10")).toBe(true);
  expect(canStepForward("2026-10", "2026-10")).toBe(false);
  expect(canStepForward("2025", "2026-10")).toBe(true);
  expect(canStepForward("2026", "2026-10")).toBe(false);
  expect(switchScope("2026-03", "year", "2026-10")).toBe("2026");
  expect(switchScope("2026", "month", "2026-10")).toBe("2026-10");
  expect(switchScope("2024", "month", "2026-10")).toBe("2024-12");
});

test("day headings: Today, Yesterday, the weekday, and the month in a year", () => {
  expect(dayLabel("2026-10-20", TODAY, false)).toBe("Today");
  expect(dayLabel("2026-10-19", TODAY, false)).toBe("Yesterday");
  expect(dayLabel("2026-10-03", TODAY, false)).toBe("Saturday 3");
  expect(dayLabel("2026-10-03", TODAY, true)).toBe("Saturday, Oct 3");
});
