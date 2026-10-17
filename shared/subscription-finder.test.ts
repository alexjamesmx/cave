import { expect, test } from "bun:test";
import { approvalWrites, dismissedOf, subscriptionProposals } from "./subscription-finder.ts";
import type { Doc } from "./types.ts";

let n = 0;
const spend = (
  title: string,
  date: string,
  amount: number,
  extra: Record<string, unknown> = {},
): Doc => ({
  id: `m${n++}`,
  kind: "item",
  collection: "money",
  data: { _title: title, date, amount, direction: "expense", ...extra },
  stamps: {},
  actor: "test",
});
const payment = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection: "payments",
  data,
  stamps: {},
  actor: "test",
});

test("repeat and next due only from three regular intervals; account only when all charges share one", () => {
  const money = [
    spend("City Gym", "2026-06-03T08:00", 699, { account: "Nu" }),
    spend("City Gym", "2026-07-03T08:00", 699, { account: "Nu" }),
    spend("City Gym", "2026-08-03T08:00", 699, { account: "Nu" }),
    spend("City Gym", "2026-09-04T08:00", 749, { account: "Nu", category: "health" }),
    spend("Claude", "2025-10-20", 3800, { account: "Nu" }),
    spend("Claude", "2026-10-20", 4000, { account: "BBVA" }),
  ];
  const [claude, fit] = subscriptionProposals(money, []);
  expect(fit).toMatchObject({
    key: "smart fit",
    title: "City Gym",
    amount: 749,
    repeat: "monthly",
    due: "2026-10-04",
    account: "Nu",
  });
  expect(fit?.charges.map((c) => c.day)).toEqual([
    "2026-06-03",
    "2026-07-03",
    "2026-08-03",
    "2026-09-04",
  ]);
  // Two charges a year apart: a subscription, but one interval doesn't say how often.
  expect(claude).toEqual({
    key: "claude",
    title: "Claude",
    amount: 4000,
    charges: [
      expect.objectContaining({ day: "2025-10-20" }),
      expect.objectContaining({ day: "2026-10-20" }),
    ],
  });
  // No category is ever proposed.
  expect(JSON.stringify([claude, fit])).not.toContain("health");
});

test("irregular spacing, single charges, linked or dismissed charges and other kinds are not proposed", () => {
  const money = [
    spend("Uber", "2026-09-01", 120),
    spend("Uber", "2026-09-03", 118),
    spend("Gift", "2026-09-01", 500),
    spend("Netflix", "2026-08-01", 199, { payment: "p-netflix" }),
    spend("Netflix", "2026-09-01", 199, { payment: "p-netflix" }),
    spend("Spotify", "2026-08-01", 129),
    spend("Spotify", "2026-09-01", 129),
    spend("Rent", "2026-08-01", 9000),
    spend("Rent", "2026-09-01", 9000),
  ];
  const payments = [payment("p-rent", { _title: "Rent", kind: "bill" })];
  expect(subscriptionProposals(money, payments, new Set(["spotify"]))).toEqual([]);
});

test("charges of an existing subscription attach to it; approval writes nothing for charges left out", () => {
  const money = [spend("iPhone", "2026-07-02", 1500), spend("iPhone", "2026-08-02", 1500)];
  const [p] = subscriptionProposals(money, [
    payment("p-iphone", { _title: "iphone", kind: "subscription" }),
  ]);
  expect(p?.attachTo).toBe("p-iphone");
  const first = p?.charges[0]?.id as string;
  expect(approvalWrites(p as never, new Set([first]), () => "new")).toEqual([
    { id: first, collection: "money", patch: { payment: "p-iphone" } },
  ]);
  expect(approvalWrites(p as never, new Set(), () => "new")).toEqual([]);
});

test("approving a new one creates the payment first, with only what history showed, then links", () => {
  const money = [spend("Gym", "2026-08-01", 500), spend("Gym", "2026-09-01", 500)];
  const [p] = subscriptionProposals(money, []);
  const writes = approvalWrites(p as never, new Set(p?.charges.map((c) => c.id)), () => "p-new");
  expect(writes[0]).toEqual({
    id: "p-new",
    collection: "payments",
    patch: { _title: "Gym", kind: "subscription", amount: 500, approx: false, active: true },
  });
  expect(writes.slice(1).map((w) => w.patch)).toEqual([{ payment: "p-new" }, { payment: "p-new" }]);
});

test("a single charge whose title is a subscription payment is offered to attach", () => {
  const [p] = subscriptionProposals(
    [spend("Netflix", "2026-09-01", 199)],
    [payment("p-netflix", { _title: "Netflix", kind: "subscription" })],
  );
  expect(p).toMatchObject({
    attachTo: "p-netflix",
    charges: [expect.objectContaining({ day: "2026-09-01" })],
  });
});

test("dismissed titles come from settings, read defensively", () => {
  expect([...dismissedOf({ subscriptionsDismissed: ["uber", 3] })]).toEqual(["uber"]);
  expect([...dismissedOf(undefined)]).toEqual([]);
});
