import { beforeEach, expect, test } from "bun:test";
import { localDateTime } from "../shared/dates.ts";
import { formatStamp, type Hlc } from "../shared/hlc.ts";
import type { Field } from "../shared/schema.ts";
import { seedDocs } from "../shared/seed.ts";
import { AgentWriter } from "./agent-writer.ts";
import type { Agent } from "./agents.ts";
import { openDb } from "./db.ts";
import { createStore, type Store } from "./store.ts";

const NOW = 1_791_900_000_000;
const agent: Agent = {
  name: "claude-code",
  scopes: ["read", "write"],
  collections: null,
  created: 1,
  revoked: null,
};
let store: Store;
let clocks: Map<string, Hlc>;

beforeEach(() => {
  store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  clocks = new Map();
});

const writer = (who: Agent = agent, now = () => NOW) =>
  new AgentWriter(store, who, AgentWriter.clockFor(clocks, who, now), now);

test("creates an item as agent:<name> with _created set by the writer", () => {
  const result = writer().create("money", {
    title: "Lunch",
    fields: { amount: 87.5, direction: "expense", category: "food", date: "2026-10-13T13:00" },
  });
  if (!result.ok) throw new Error(result.error);
  const doc = store.get(result.id);
  expect(doc?.actor).toBe("agent:claude-code");
  expect(doc?.data).toMatchObject({ _title: "Lunch", amount: 87.5, category: "food" });
  expect(doc?.data._created).toBe(new Date(NOW).toISOString());
  expect(Object.values(doc?.stamps ?? {}).every((s) => s.endsWith(":agent-claude-code"))).toBe(
    true,
  );
  expect(result.seqs).toHaveLength(1);
});

test("refuses a category that is not an option, never guessing one", () => {
  const result = writer().create("money", { title: "Gift", fields: { category: "pets" } });
  expect(result).toMatchObject({ ok: false });
  expect(!result.ok && result.error).toContain("field category: must be one of");
});

test("refuses reserved, unknown and archived keys with a reason", () => {
  const w = writer();
  expect(w.create("money", { title: "x", fields: { _deleted: true } })).toEqual({
    ok: false,
    error: "_deleted cannot be set by an agent",
  });
  expect(w.create("money", { title: "x", fields: { _created: "2020-01-01" } })).toMatchObject({
    ok: false,
  });
  expect(w.create("money", { title: "x", fields: { bucket: "needs" } })).toEqual({
    ok: false,
    error: "unknown field bucket",
  });
  const money = store.get("money");
  if (!money) throw new Error("no money");
  const fields = (money.data.fields as Field[]).map((f) =>
    f.id === "account" ? { ...f, archived: true } : f,
  );
  store.applyChanges(
    [{ ...money, data: { fields }, stamps: { fields: formatStamp(2, 0, "dev-a") } }],
    "user:dev-a",
    2,
  );
  expect(w.create("money", { title: "x", fields: { account: "bank" } })).toEqual({
    ok: false,
    error: "field account was removed by the owner",
  });
});

test("title and body limits", () => {
  const w = writer();
  expect(w.create("tasks", { title: "x".repeat(501) })).toMatchObject({ ok: false });
  expect(w.create("tasks", { title: "ok", body: "é".repeat(60_000) })).toMatchObject({
    ok: false,
  });
  expect(w.create("tasks", { title: "  " })).toEqual({ ok: false, error: "title is required" });
});

test("update writes only the keys that change, stamped after the stored ones", () => {
  const created = writer().create("tasks", { title: "Ship", fields: { status: "todo" } });
  if (!created.ok) throw new Error(created.error);
  // A device edited the title with a stamp far ahead of the agent's clock.
  const ahead = formatStamp(NOW + 60_000, 0, "laptop");
  const doc = store.get(created.id);
  if (!doc) throw new Error("missing");
  store.applyChanges(
    [{ ...doc, data: { _title: "Ship it" }, stamps: { _title: ahead } }],
    "user:laptop",
    NOW,
  );

  const updated = writer().update(created.id, { title: "Ship v0.1", fields: { status: "todo" } });
  if (!updated.ok) throw new Error(updated.error);
  const after = store.get(created.id);
  expect(after?.data._title).toBe("Ship v0.1");
  expect((after?.stamps._title as string) > ahead).toBe(true);
  const [change] = store.changesBySeq(updated.seqs);
  expect(change?.keys).toEqual(["_title"]);

  expect(writer().update(created.id, { fields: { status: "todo" } })).toEqual({
    ok: true,
    id: created.id,
    seqs: [],
  });
});

test("the allowlist hides collections and their items; proposals cannot be written", () => {
  const created = writer().create("tasks", { title: "Ship" });
  if (!created.ok) throw new Error(created.error);
  const moneyOnly = writer({ ...agent, name: "codex", collections: ["money"] });
  expect(moneyOnly.create("tasks", { title: "x" })).toEqual({
    ok: false,
    error: "collection tasks not found",
  });
  expect(moneyOnly.update(created.id, { title: "x" })).toEqual({
    ok: false,
    error: `item ${created.id} not found`,
  });
  expect(writer().create("proposals", { title: "x" })).toMatchObject({ ok: false });
});

test("propose_delete creates a pending proposal and leaves the target alone", () => {
  const created = writer().create("tasks", { title: "Old task" });
  if (!created.ok) throw new Error(created.error);
  const proposal = writer().proposeDelete(created.id, "Duplicate of another task");
  if (!proposal.ok) throw new Error(proposal.error);
  expect(store.get(proposal.id)?.data).toMatchObject({
    _title: "Delete “Old task”",
    target: created.id,
    action: "delete",
    status: "pending",
    agent: "claude-code",
  });
  expect(store.get(created.id)?.data._deleted).toBeUndefined();
  expect(writer().update(proposal.id, { title: "x" })).toMatchObject({ ok: false });
});

test("a hidden collection is invisible to writes, as it is to reads", () => {
  const hidden = {
    id: "private",
    kind: "collection" as const,
    collection: null,
    data: {
      name: "Private",
      icon: "lock",
      color: "#fff",
      order: 9,
      hidden: true,
      fields: [],
      views: [],
    },
    stamps: {} as Record<string, string>,
    actor: "",
  };
  hidden.stamps = Object.fromEntries(
    Object.keys(hidden.data).map((key) => [key, formatStamp(2, 0, "dev-a")]),
  );
  store.applyChanges([hidden], "user:dev-a", 2);
  const item = {
    id: "secret",
    kind: "item" as const,
    collection: "private",
    data: { _title: "x" },
    stamps: { _title: formatStamp(2, 0, "dev-a") },
    actor: "",
  };
  store.applyChanges([item], "user:dev-a", 2);

  expect(writer().create("private", { title: "x" })).toEqual({
    ok: false,
    error: "collection private not found",
  });
  expect(writer().update("secret", { title: "y" })).toEqual({
    ok: false,
    error: "item secret not found",
  });
  expect(writer().proposeDelete("secret", "why")).toMatchObject({ ok: false });
});

test("done on a repeating reminder advances due and keeps it open, as the app's Done does", () => {
  const w = writer();
  const created = w.create("reminders", {
    title: "Pay rent",
    fields: { due: "2026-10-22T09:00", repeat: "monthly", done: false },
  });
  if (!created.ok) throw new Error(created.error);
  // NOW is Oct 13; finishing early still moves it to the next occurrence.
  expect(w.update(created.id, { fields: { done: true } })).toMatchObject({ ok: true });
  expect(store.get(created.id)?.data).toMatchObject({ due: "2026-11-22T09:00", done: false });
});

test("done with a new due in the same patch starts the series from that due", () => {
  const w = writer();
  const created = w.create("reminders", {
    title: "Water plants",
    fields: { due: "2026-10-10T09:00", repeat: "weekly" },
  });
  if (!created.ok) throw new Error(created.error);
  w.update(created.id, { fields: { due: "2026-10-14T18:00", done: true } });
  expect(store.get(created.id)?.data).toMatchObject({ due: "2026-10-21T18:00" });
  expect(store.get(created.id)?.data.done).not.toBe(true);
});

test("done on a reminder that doesn't repeat is written as is", () => {
  const w = writer();
  const once = w.create("reminders", {
    title: "Call bank",
    fields: { due: "2026-10-14T10:00", repeat: "none" },
  });
  if (!once.ok) throw new Error(once.error);
  w.update(once.id, { fields: { done: true } });
  expect(store.get(once.id)?.data).toMatchObject({ due: "2026-10-14T10:00", done: true });
});

test("status done on a repeating task brings it back on its next date, still open", () => {
  const w = writer();
  const created = w.create("tasks", {
    title: "Pay rent",
    fields: { due: "2026-11-01", repeat: "monthly", status: "todo" },
  });
  if (!created.ok) throw new Error(created.error);
  expect(w.update(created.id, { fields: { status: "done" } })).toMatchObject({ ok: true });
  expect(store.get(created.id)?.data).toMatchObject({ due: "2026-12-01", status: "todo" });
  expect(store.get(created.id)?.data.completed).toBeString();
  const once = w.create("tasks", { title: "Once", fields: { status: "todo" } });
  if (!once.ok) throw new Error(once.error);
  w.update(once.id, { fields: { status: "done" } });
  expect(store.get(once.id)?.data.status).toBe("done");
});

const finding = (url: string, why = "New model release") => ({
  title: "Claude 5.5 is out",
  fields: { url, why, source: "anthropic.com" },
});

test("a radar finding needs an http address and a reason, and starts new", () => {
  expect(writer().create("radar", { title: "No url", fields: { why: "x" } })).toEqual({
    ok: false,
    error: "url is required: an http or https address",
  });
  const mail = writer().create("radar", finding("mailto:a@b.c"));
  expect(mail.ok).toBe(false);
  expect(writer().create("radar", finding("https://a.dev/x", " ")).ok).toBe(false);
  const result = writer().create("radar", finding("https://a.dev/x"));
  if (!result.ok) throw new Error(result.error);
  expect(store.get(result.id)?.data).toMatchObject({
    status: "new",
    found_at: localDateTime(new Date(NOW), "America/Mexico_City"),
    _addedBy: "claude-code",
  });
});

test("the same address twice is refused with the id already there", () => {
  const first = writer().create("radar", finding("https://www.A.dev/post/"));
  if (!first.ok) throw new Error(first.error);
  expect(writer().create("radar", finding("https://www.a.dev/post#top"))).toEqual({
    ok: false,
    error: `already on the radar as ${first.id}`,
  });
});

test("an agent adds at most 50 findings a day; another agent and the next day are unaffected", () => {
  let now = NOW;
  const clock = () => now;
  for (let i = 0; i < 50; i++) {
    now = NOW + i;
    const r = writer(agent, clock).create("radar", finding(`https://a.dev/${i}`));
    if (!r.ok) throw new Error(r.error);
  }
  now = NOW + 100;
  expect(writer(agent, clock).create("radar", finding("https://a.dev/51"))).toEqual({
    ok: false,
    error: "limit reached: 50 radar items a day",
  });
  const other = { ...agent, name: "codex" };
  expect(writer(other, clock).create("radar", finding("https://a.dev/52")).ok).toBe(true);
  now = NOW + 24 * 60 * 60 * 1000 + 50;
  expect(writer(agent, clock).create("radar", finding("https://a.dev/53")).ok).toBe(true);
});
