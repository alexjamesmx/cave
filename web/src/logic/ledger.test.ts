import { expect, test } from "bun:test";
import type { Field } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { type LedgerQuery, ledger, queryFromSearch, queryToSearch } from "./ledger.ts";

const category: Field = {
  id: "category",
  name: "Category",
  type: "select",
  options: [
    { value: "food", icon: "tag", color: "#000", label: "Food", emoji: "🍔", kind: "expense" },
    { value: "salary", icon: "tag", color: "#000", label: "Salary", kind: "income" },
    { value: "invest", icon: "tag", color: "#000", label: "Investment", kind: "transfer" },
  ],
};
const account: Field = {
  id: "account",
  name: "Account",
  type: "select",
  options: [{ value: "bank", icon: "landmark", color: "#000", label: "Bank" }],
};

let n = 0;
const doc = (data: Record<string, unknown>): Doc => ({
  id: `d${++n}`,
  kind: "item",
  collection: "money",
  data,
  stamps: {},
  actor: "",
});

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
    _title: "GBM",
    amount: 5000,
    direction: "expense",
    category: "invest",
    date: "2026-10-05T09:00",
  }),
  doc({ _title: "Mystery", amount: 90, direction: "expense", date: "2026-10-04T09:00" }),
  doc({
    _title: "Renamed away",
    amount: 15,
    direction: "expense",
    category: "gone",
    date: "2026-10-04T10:00",
  }),
  doc({
    _title: "Last month",
    amount: 500,
    direction: "expense",
    category: "food",
    date: "2026-09-20T10:00",
  }),
  doc({ _title: "No date", amount: 77, direction: "expense", category: "food" }),
];

const base: LedgerQuery = {
  month: "2026-10",
  chip: "all",
  text: "",
  category: "",
  account: "",
  groupBy: "day",
};

test("a month, grouped by day, newest first, with subtotals and totals; undated apart", () => {
  const l = ledger(docs, base, category, account);
  expect(l.undated.map((d) => d.data._title)).toEqual(["No date"]);
  expect(l.groups.map((g) => [g.label, g.rows.length, g.out, g.in])).toEqual([
    ["Oct 5", 1, 0, 0],
    ["Oct 4", 2, 105, 0],
    ["Oct 3", 2, 180, 0],
    ["Oct 1", 1, 0, 30000],
  ]);
  expect(l.totals).toEqual({ in: 30000, out: 285, transferred: 5000, count: 6 });
});

test("chips: transfers by kind, uncategorized for empty or unknown categories", () => {
  const transfers = ledger(docs, { ...base, chip: "transfer" }, category, account);
  expect(transfers.groups.flatMap((g) => g.rows.map((d) => d.data._title))).toEqual(["GBM"]);
  const un = ledger(docs, { ...base, chip: "uncategorized" }, category, account);
  expect(un.groups.flatMap((g) => g.rows.map((d) => d.data._title))).toEqual([
    "Renamed away",
    "Mystery",
  ]);
  const income = ledger(docs, { ...base, chip: "income" }, category, account);
  expect(income.totals).toEqual({ in: 30000, out: 0, transferred: 0, count: 1 });
});

test("group by category puts the biggest first and names the unknown bucket; all time spans months", () => {
  const l = ledger(docs, { ...base, month: "all", groupBy: "category" }, category, account);
  expect(l.groups.map((g) => [g.label, g.rows.length])).toEqual([
    ["Salary", 1],
    ["Investment", 1],
    ["🍔 Food", 3],
    ["Uncategorized", 2],
  ]);
  expect(l.groups.find((g) => g.label === "🍔 Food")?.out).toBe(680);
  const byDay = ledger(docs, { ...base, month: "all" }, category, account);
  expect(byDay.groups[byDay.groups.length - 1]?.label).toBe("Sep 20 2026");
});

test("text search ignores accents; group by account names the missing one", () => {
  const l = ledger(docs, { ...base, text: "cafe" }, category, account);
  expect(l.totals.count).toBe(1);
  const byAccount = ledger(docs, { ...base, groupBy: "account" }, category, account);
  expect(byAccount.groups.map((g) => g.label)).toEqual(["Bank", "No account"]);
});

test("the query round-trips through the URL, defaults left out", () => {
  expect(queryToSearch(base, "2026-10")).toBe("");
  const q: LedgerQuery = {
    month: "all",
    chip: "expense",
    text: "ta",
    category: "food",
    account: "bank",
    groupBy: "category",
  };
  const s = queryToSearch(q, "2026-10");
  expect(queryFromSearch(s, "2026-10")).toEqual(q);
  expect(queryFromSearch("?month=nope&chip=x&group=y", "2026-10")).toEqual(base);
});
