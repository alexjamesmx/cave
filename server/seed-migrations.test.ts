import { expect, test } from "bun:test";
import { fieldsOf } from "../shared/fields.ts";
import { builtInFlowsMigration } from "../shared/flows/built-in.ts";
import { formatStamp } from "../shared/hlc.ts";
import { DEFAULT_NOTIFICATIONS } from "../shared/notifications.ts";
import { retireProjectsMigration } from "../shared/retire-projects.ts";
import type { Field } from "../shared/schema.ts";
import { retireAiMigration, SEED_VERSION, seedDocs } from "../shared/seed.ts";
import type { Doc } from "../shared/types.ts";
import { openDb } from "./db.ts";
import m2Seed from "./fixtures/m2-seed.json";
import { migrateSeed, seedVersionOf } from "./seed-migrations.ts";
import { createStore } from "./store.ts";

const NOW = 1_791_900_000_000;

test("a database seeded before seed migrations gets the proposals and the reminder time once", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(m2Seed as Doc[], 1);
  expect(store.get("proposals")).toBeUndefined();
  expect(seedVersionOf(store)).toBe(1);

  expect(migrateSeed(store, NOW)).toEqual([
    2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  ]);
  expect(store.get("flows")?.data).toMatchObject({ name: "Flows", hidden: true });
  expect(store.get("flow-rent")).toMatchObject({ collection: "flows", actor: "seed" });
  const proposals = store.get("proposals");
  expect(proposals?.data).toMatchObject({ name: "Proposals", hidden: true });
  expect(proposals?.actor).toBe("seed");
  expect(store.get("settings")?.data).toEqual({
    timezone: "America/Mexico_City",
    reminderTime: "09:00",
    notifications: DEFAULT_NOTIFICATIONS,
    // Migration 20 moved the M2 Habits view's icons here.
    habitIcons: expect.objectContaining({ gym: "dumbbell" }),
    seedVersion: SEED_VERSION,
  });
  // The migration and the version bump are one change batch with one actor and time.
  const log = store.changeLog().filter((c) => c.at === NOW);
  expect(new Set(log.map((c) => c.actor))).toEqual(new Set(["seed"]));
  expect(log.slice(0, 9).map((c) => c.id)).toEqual([
    "proposals",
    "settings",
    "settings",
    "flows",
    "flow-rent",
    "flow-salary",
    "money",
    "tasks",
    "payments",
  ]);
  // Migration 8 (the `ai` collection) is a no-op since M10 retired it.
  expect(store.get("ai")).toBeUndefined();
  expect(log.at(-1)?.id).toBe("settings");

  const length = store.changeLog().length;
  expect(migrateSeed(store, NOW + 1)).toEqual([]);
  expect(store.changeLog()).toHaveLength(length);
});

test("a fresh seed is already at the latest version", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  expect(seedVersionOf(store)).toBe(SEED_VERSION);
  expect(migrateSeed(store, NOW)).toEqual([]);
  expect(store.get("proposals")?.data).toEqual(seedDocs().find((d) => d.id === "proposals")?.data);
});

test("seed migration 6 merges the categories: the owner's options and edits stay, the set is added", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(m2Seed as Doc[], 1);
  const money = store.get("money") as Doc;
  const fields = (money.data.fields as Field[]).map((f) =>
    f.id === "category"
      ? {
          ...f,
          options: [
            ...(f.options ?? []).map((o) => (o.value === "food" ? { ...o, label: "Comida" } : o)),
            { value: "pets", icon: "dog", color: "#123456" },
          ],
        }
      : f,
  );
  store.applyChanges(
    [
      {
        ...money,
        data: { fields },
        stamps: { fields: formatStamp(NOW - 1000, 0, "phone") },
        actor: "user:phone",
      },
    ],
    "user:phone",
    NOW - 1000,
  );
  migrateSeed(store, NOW);
  const options = fieldsOf(store.get("money")).find((f) => f.id === "category")?.options ?? [];
  const byValue = new Map(options.map((o) => [o.value, o]));
  expect(byValue.get("food")).toMatchObject({ label: "Comida", emoji: "🍔", kind: "expense" });
  expect(byValue.get("pets")).toEqual({ value: "pets", icon: "dog", color: "#123456" });
  expect(byValue.get("health")).toMatchObject({ label: "Health & gym", kind: "expense" });
  expect(byValue.get("investment")?.kind).toBe("transfer");
  for (const value of ["gula", "error", "subscriptions", "salary", "vales", "between_accounts"])
    expect(byValue.has(value)).toBe(true);
  // Existing options keep their place; the new ones follow.
  expect(options.slice(0, 2).map((o) => o.value)).toEqual(["food", "home"]);
});

test("seed migration 24 retires Projects: collections and items marked deleted, refs archived with their values, templates cleared, idempotent", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  // A database at version 23, as Projects left it: three collections, refs on others, templates.
  const stamp = formatStamp(NOW - 5000, 0, "phone");
  const doc = (
    id: string,
    kind: Doc["kind"],
    collection: string | null,
    data: Record<string, unknown>,
  ): Doc => ({
    id,
    kind,
    collection,
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "user:phone",
  });
  const ref = (id: string, target: string): Field => ({
    id,
    name: id,
    type: "ref",
    config: { collection: target },
  });
  const empty = { icon: "folder", fields: [], views: [] };
  store.applyChanges(
    [
      doc("projects", "collection", null, { name: "Projects", ...empty }),
      doc("parts", "collection", null, { name: "Parts", ...empty }),
      doc("runs", "collection", null, { name: "Runs", hidden: true, ...empty }),
      doc("tasks", "collection", null, {
        fields: [...fieldsOf(store.get("tasks")), ref("project", "projects"), ref("part", "parts")],
      }),
      doc("notes", "collection", null, {
        fields: [...fieldsOf(store.get("notes")), ref("project", "projects")],
      }),
      doc("p1", "item", "projects", { _title: "Kitchen", status: "active" }),
      doc("p-gone", "item", "projects", { _title: "Old", _deleted: true }),
      doc("part1", "item", "parts", { _title: "Paint", project: "p1" }),
      doc("run1", "item", "runs", { _title: "Plan", project: "p1", status: "done" }),
      doc("t1", "item", "tasks", {
        _title: "Buy paint",
        status: "todo",
        project: "p1",
        part: "part1",
      }),
      doc("settings", "setting", null, { seedVersion: 23, projectTemplates: { generic: {} } }),
    ],
    "user:phone",
    NOW - 5000,
  );

  expect(migrateSeed(store, NOW)).toEqual([24]);
  for (const id of ["projects", "parts", "runs", "p1", "part1", "run1"]) {
    const d = store.get(id) as Doc;
    expect(d.data._deleted).toBe(true);
    expect(d.actor).toBe("seed");
  }
  // An item already deleted keeps its own delete.
  expect(store.get("p-gone")?.stamps._deleted).toBe(stamp);
  const field = (c: string, id: string) => fieldsOf(store.get(c)).find((f) => f.id === id);
  expect(field("tasks", "project")?.archived).toBe(true);
  expect(field("tasks", "part")?.archived).toBe(true);
  expect(field("notes", "project")?.archived).toBe(true);
  expect(field("tasks", "status")?.archived).toBeUndefined();
  // The task stays, values and all.
  expect(store.get("t1")?.data).toMatchObject({
    _title: "Buy paint",
    project: "p1",
    part: "part1",
  });
  expect(store.get("t1")?.data._deleted).toBeUndefined();
  expect(store.get("settings")?.data.projectTemplates).toBeNull();
  expect(seedVersionOf(store)).toBe(24);

  // Nothing left to do on what it produced, or on a fresh seed that never had Projects.
  expect(retireProjectsMigration(store.get, (c) => store.itemsOf(c))).toEqual([]);
  const fresh = createStore(openDb(":memory:"));
  fresh.seedIfEmpty(seedDocs(), 1);
  for (const id of ["projects", "parts", "runs"]) expect(fresh.get(id)).toBeUndefined();
  expect(retireProjectsMigration(fresh.get, (c) => fresh.itemsOf(c))).toEqual([]);
});

test("a later migration's write to the same key in one run wins over an earlier one's", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(m2Seed as Doc[], 1);
  migrateSeed(store, NOW);
  // 6 wrote money's fields with the categories; 10 then rewrote the same key (accounts a list).
  const fields = fieldsOf(store.get("money"));
  expect(fields.find((f) => f.id === "account")?.type).toBe("select");
  expect(fields.find((f) => f.id === "detail")?.archived).toBe(true);
  const category = fields.find((f) => f.id === "category");
  expect(category?.options?.some((o) => o.value === "gula")).toBe(true);
});

test("seed migration 16 marks the ai collection and its live items deleted, touches nothing else, and is idempotent", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(m2Seed as Doc[], 1);
  // A database at version 15 with the collection migration 8 used to create, and items in it.
  const stamp = formatStamp(NOW - 5000, 0, "ai-sync");
  const doc = (
    id: string,
    kind: Doc["kind"],
    collection: string | null,
    data: Record<string, unknown>,
  ): Doc => ({
    id,
    kind,
    collection,
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "user:ai-sync",
  });
  store.applyChanges(
    [
      doc("ai", "collection", null, { name: "AI", icon: "sparkles", fields: [], views: [] }),
      doc("ai-rule", "item", "ai", { _title: "AGENTS.md", kind: "rule" }),
      doc("ai-skill", "item", "ai", { _title: "A skill", kind: "skill" }),
      doc("ai-gone", "item", "ai", { _title: "Old", kind: "rule", _deleted: true }),
      doc("task-1", "item", "tasks", { _title: "Keep me", status: "todo" }),
      doc("settings", "setting", null, { seedVersion: 15 }),
    ],
    "user:ai-sync",
    NOW - 5000,
  );

  expect(migrateSeed(store, NOW)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24]);
  for (const id of ["ai", "ai-rule", "ai-skill"]) {
    const d = store.get(id) as Doc;
    expect(d.data._deleted).toBe(true);
    expect(d.actor).toBe("seed");
    expect(d.stamps._deleted?.endsWith("seed")).toBe(true);
  }
  // Other keys keep their stamps; only `_deleted` was written.
  expect(store.get("ai-rule")?.data).toMatchObject({ _title: "AGENTS.md", kind: "rule" });
  expect(store.get("ai-rule")?.stamps._title).toBe(stamp);
  expect(store.get("ai-gone")?.stamps._deleted).toBe(stamp);
  expect(store.get("task-1")?.data._deleted).toBeUndefined();
  expect(store.itemsOf("ai")).toEqual([]);
  expect(seedVersionOf(store)).toBe(24);

  // Nothing left to do on what it produced, or on a database that never had the collection.
  expect(retireAiMigration(store.get, (c) => store.itemsOf(c))).toEqual([]);
  const fresh = createStore(openDb(":memory:"));
  fresh.seedIfEmpty(seedDocs(), 1);
  expect(fresh.get("ai")).toBeUndefined();
  expect(retireAiMigration(fresh.get, (c) => fresh.itemsOf(c))).toEqual([]);
});

test("seed migration 22 clears the radar interests and subscription dismissals, and is idempotent", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  const settings = store.get("settings") as Doc;
  store.applyChanges(
    [
      {
        ...settings,
        data: {
          seedVersion: 21,
          radarInterests: [{ name: "AI", keywords: [] }],
          dismissedSubscriptions: ["x"],
        },
        stamps: {
          seedVersion: "0000000000001:0000:test",
          radarInterests: "0000000000001:0000:test",
          dismissedSubscriptions: "0000000000001:0000:test",
        },
        actor: "test",
      },
    ],
    "test",
    1,
  );
  expect(migrateSeed(store, NOW)).toEqual([22, 23, 24]);
  expect(store.get("settings")?.data).toMatchObject({
    radarInterests: null,
    dismissedSubscriptions: null,
  });
  expect(store.get("settings")?.data.timezone).toBe("America/Mexico_City");
  expect(migrateSeed(store, NOW + 1)).toEqual([]);
});

test("seed migration 23 adds the built-in flows, on from now, the digest at the owner's digest time; it never replaces one", () => {
  const store = createStore(openDb(":memory:"));
  // A database at 22: no built-in flows yet, and a digest time set.
  store.seedIfEmpty(
    seedDocs().filter((d) => d.data.author !== "cave"),
    1,
  );
  const settings = store.get("settings") as Doc;
  const old = "0000000000001:0000:test";
  store.applyChanges(
    [
      {
        ...settings,
        data: { seedVersion: 22, notifications: { channels: ["email"], digest: "07:30" } },
        stamps: { seedVersion: old, notifications: old },
        actor: "test",
      },
    ],
    "test",
    1,
  );
  expect(migrateSeed(store, NOW)).toEqual([23, 24]);
  const flow = (id: string) => store.get(id) as Doc;
  expect(flow("flow-reminders").data).toMatchObject({ status: "on", author: "cave" });
  expect(flow("flow-reminders").stamps.status).toBe(formatStamp(NOW, 0, "seed"));
  expect(flow("flow-digest").data).toMatchObject({
    status: "on",
    definition: { trigger: { type: "schedule", every: "day", at: "07:30" } },
  });
  expect(migrateSeed(store, NOW + 1)).toEqual([]);
  // One the owner deleted stays deleted: the migration only adds what is missing.
  expect(
    builtInFlowsMigration((id) => (id === "flow-digest" ? flow(id) : undefined)).map((f) => f.id),
  ).not.toContain("flow-digest");
});
