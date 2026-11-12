import { expect, test } from "bun:test";
import type { SelectOption } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import { paidEntry } from "./subscription-paid.ts";

const opt = (value: string, archived = false): SelectOption => ({
  value,
  icon: "tag",
  color: "#000",
  ...(archived ? { archived: true } : {}),
});
const categories = [opt("subscriptions"), opt("old", true)];
const accounts = [opt("card")];
const sub = (data: Record<string, unknown>): Doc => ({
  id: "sub1",
  kind: "item",
  collection: "payments",
  data: {
    _title: "Streaming",
    kind: "subscription",
    amount: 149,
    category: "subscriptions",
    account: "card",
    ...data,
  },
  stamps: {},
  actor: "",
});

test("one tap logs the charge with the subscription's amount, category and account, linked to it", () => {
  expect(paidEntry(sub({}), categories, accounts, "2026-10-05T09:30")).toEqual({
    _title: "Streaming",
    amount: 149,
    direction: "expense",
    date: "2026-10-05T09:30",
    category: "subscriptions",
    account: "card",
    payment: "sub1",
  });
});

test("the form asks instead when the amount varies, or a list no longer offers its value", () => {
  const at = "2026-10-05T09:30";
  expect(paidEntry(sub({ approx: true }), categories, accounts, at)).toBeUndefined();
  expect(paidEntry(sub({ amount: undefined }), categories, accounts, at)).toBeUndefined();
  expect(paidEntry(sub({ category: "old" }), categories, accounts, at)).toBeUndefined();
  expect(paidEntry(sub({ category: undefined }), categories, accounts, at)).toBeUndefined();
  expect(paidEntry(sub({ account: "gone" }), categories, accounts, at)).toBeUndefined();
});
