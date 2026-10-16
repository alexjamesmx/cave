import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Proposal } from "../shared/money-review.ts";
import { seedDocs } from "../shared/seed.ts";
import { serveCave } from "./app.ts";
import { openDb } from "./db.ts";
import { createMoneyReview, moneyReviewRoutes } from "./money-review.ts";
import { createStore, type Store } from "./store.ts";

const OWNER = "owner-secret";
let server: ReturnType<typeof serveCave>;
let store: Store;

const p = (id: string, from: string | null, to: string | null): Proposal => ({
  id,
  from,
  to,
  rule: "test",
  date: "2026-10-01T12:00",
  title: id,
  amount: 10,
  direction: "expense",
});

beforeAll(() => {
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  server = serveCave({
    hostname: "127.0.0.1",
    port: 0,
    store,
    token: OWNER,
    now: Date.now,
    moneyReview: moneyReviewRoutes(createMoneyReview(db, Date.now)),
  });
});
afterAll(() => server.stop(true));

const call = (path: string, body?: unknown, token: string | null = OWNER) =>
  fetch(new URL(path, server.url), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("submitting a review stores proposals and changes no entry", async () => {
  const before = store.changeLog().length;
  const res = await call("/api/money-review", {
    proposals: [p("a", "other", null), p("b", null, "gula")],
  });
  expect(await res.json()).toEqual({ kept: 2, skipped: 0 });
  expect(store.changeLog().length).toBe(before);
  const review = await (await call("/api/money-review")).json();
  expect(review.proposals.map((x: Proposal) => x.id)).toEqual(["a", "b"]);
});

test("decided entries aren't proposed again; Undo makes them undecided", async () => {
  await call("/api/money-review/decide", {
    decisions: [
      { id: "a", category: null },
      { id: "b", category: "other" },
    ],
    batch: {
      id: "batch1",
      changes: [
        { id: "a", before: "other", after: null },
        { id: "b", before: null, after: "other" },
      ],
    },
  });
  // The same review again: "a" now sits at the decided null, "b" at the owner's override.
  const again = await call("/api/money-review", {
    proposals: [p("a", null, "travel"), p("b", "other", null), p("c", "fun", null)],
  });
  expect(await again.json()).toEqual({ kept: 1, skipped: 2 });

  const undone = await (await call("/api/money-review/undo", { batch: "batch1" })).json();
  expect(undone.decided).toEqual({});
  expect(undone.batches[0].undone).toBe(true);
  expect((await call("/api/money-review/undo", { batch: "batch1" })).status).toBe(404);
});

test("only the owner reaches the review, and bad input is refused", async () => {
  expect((await call("/api/money-review", undefined, null)).status).toBe(401);
  expect((await call("/api/money-review", { proposals: [{ id: "x" }] })).status).toBe(400);
  expect((await call("/api/money-review/decide", { decisions: [] })).status).toBe(400);
});
