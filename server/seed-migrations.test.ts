import { expect, test } from "bun:test";
import { fieldsOf } from "../shared/fields.ts";
import { formatStamp } from "../shared/hlc.ts";
import { DEFAULT_NOTIFICATIONS } from "../shared/notifications.ts";
import { DEFAULT_TEMPLATES } from "../shared/projects.ts";
import { CAVE_PROJECT, LEETCODE_PROJECT, projectsMigration } from "../shared/projects-seed.ts";
import type { Field } from "../shared/schema.ts";
import { SEED_VERSION, seedDocs } from "../shared/seed.ts";
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

  expect(migrateSeed(store, NOW)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(store.get("flows")?.data).toMatchObject({ name: "Flows", hidden: true });
  expect(store.get("flow-rent")).toMatchObject({ collection: "flows", actor: "seed" });
  const proposals = store.get("proposals");
  expect(proposals?.data).toMatchObject({ name: "Proposals", hidden: true });
  expect(proposals?.actor).toBe("seed");
  expect(store.get("settings")?.data).toEqual({
    timezone: "America/Mexico_City",
    reminderTime: "09:00",
    notifications: DEFAULT_NOTIFICATIONS,
    projectTemplates: DEFAULT_TEMPLATES,
    seedVersion: SEED_VERSION,
  });
  // The migration and the version bump are one change batch with one actor and time.
  const log = store.changeLog().filter((c) => c.at === NOW);
  expect(new Set(log.map((c) => c.actor))).toEqual(new Set(["seed"]));
  expect(log.slice(0, 10).map((c) => c.id)).toEqual([
    "proposals",
    "settings",
    "settings",
    "flows",
    "flow-rent",
    "flow-salary",
    "money",
    "tasks",
    "payments",
    "ai",
  ]);
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
            { value: "pets", icon: "dog", color: "#8C93A0" },
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
  expect(byValue.get("pets")).toEqual({ value: "pets", icon: "dog", color: "#8C93A0" });
  expect(byValue.get("health")).toMatchObject({ label: "Health & gym", kind: "expense" });
  expect(byValue.get("investment")?.kind).toBe("transfer");
  for (const value of ["gula", "error", "subscriptions", "salary", "vales", "between_accounts"])
    expect(byValue.has(value)).toBe(true);
  // Existing options keep their place; the new ones follow.
  expect(options.slice(0, 2).map((o) => o.value)).toEqual(["food", "home"]);
});

test("seed migration 9: project refs, parts, LeetCode linked, the Cave's milestones, idempotent", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(m2Seed as Doc[], 1);
  const stamp = formatStamp(NOW - 5000, 0, "phone");
  const problem = (id: string, data: Record<string, unknown>): Doc => ({
    id,
    kind: "item",
    collection: "leetcode",
    data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
    actor: "user:phone",
  });
  store.applyChanges(
    [
      problem("lc1", { _title: "Two Sum", status: "solved" }),
      problem("lc2", { _title: "LRU", status: "queued" }),
    ],
    "user:phone",
    NOW - 5000,
  );
  migrateSeed(store, NOW);

  expect(store.get(LEETCODE_PROJECT)?.data).toMatchObject({
    _title: "LeetCode",
    template: "learning",
  });
  expect(store.get("lc1")?.data).toMatchObject({
    _title: "Two Sum",
    status: "solved",
    project: LEETCODE_PROJECT,
  });
  expect(store.get("lc2")?.data.project).toBe(LEETCODE_PROJECT);
  const parts = store.itemsOf("parts").filter((p) => p.data.project === CAVE_PROJECT);
  expect(parts.map((p) => [p.data._title, p.data.status])).toContainEqual([
    "M8: one structure, and Projects",
    "active",
  ]);
  expect(parts).toHaveLength(10);
  const field = (c: string, id: string) => fieldsOf(store.get(c)).find((f) => f.id === id);
  for (const c of ["tasks", "ideas", "leetcode", "reminders", "money"])
    expect(field(c, "project")).toMatchObject({ type: "ref", config: { collection: "projects" } });
  expect(field("tasks", "part")).toMatchObject({ type: "ref", config: { collection: "parts" } });
  expect(field("projects", "template")?.type).toBe("select");

  // Run again on what it produced: nothing left to do.
  expect(
    projectsMigration(store.get, (c) => store.itemsOf(c), new Date(NOW).toISOString()),
  ).toEqual([]);
});

test("a later migration's write to the same key in one run wins over an earlier one's", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(m2Seed as Doc[], 1);
  migrateSeed(store, NOW);
  // 6 wrote money's fields with the categories; 9 then added `project` to the same key.
  const ids = fieldsOf(store.get("money")).map((f) => f.id);
  expect(ids).toContain("project");
  const category = fieldsOf(store.get("money")).find((f) => f.id === "category");
  expect(category?.options?.some((o) => o.value === "gula")).toBe(true);
});
