import { expect, test } from "bun:test";
import { SEED_STAMP } from "./hlc.ts";
import { FIELD_TYPES, VIEW_TYPES } from "./schema.ts";
import { SEED_VERSION, seedDocs } from "./seed.ts";

const docs = seedDocs();
const byId = new Map(docs.map((d) => [d.id, d]));
const collections = docs.filter((d) => d.kind === "collection");

type SeedField = {
  id: string;
  type: string;
  config?: { withTime?: boolean };
  options?: { value: string; icon: string; color: string }[];
};
const fieldOf = (collection: string, id: string) =>
  ((byId.get(collection)?.data.fields ?? []) as SeedField[]).find((f) => f.id === id);

test("seeds the plan's eight collections, hidden proposals and the settings doc", () => {
  expect(collections.map((d) => d.id).sort()).toEqual(
    [
      "ideas",
      "journal",
      "leetcode",
      "money",
      "projects",
      "proposals",
      "reminders",
      "tasks",
      "wealth",
    ].sort(),
  );
  expect(byId.get("proposals")?.data.hidden).toBe(true);
  expect(collections.filter((c) => c.data.hidden).map((c) => c.id)).toEqual(["proposals"]);
  expect(byId.get("settings")).toMatchObject({
    kind: "setting",
    collection: null,
    data: { timezone: "America/Mexico_City", seedVersion: SEED_VERSION },
  });
  expect(docs).toHaveLength(10);
});

test("every key is stamped with time 0 so any edit wins", () => {
  for (const doc of docs) {
    expect(doc.collection).toBeNull();
    expect(Object.keys(doc.stamps).sort()).toEqual(Object.keys(doc.data).sort());
    expect(Object.values(doc.stamps).every((s) => s === SEED_STAMP)).toBe(true);
  }
});

test("dates that carry a time are flagged withTime", () => {
  expect(fieldOf("reminders", "due")).toMatchObject({ type: "date", config: { withTime: true } });
  expect(fieldOf("money", "date")).toMatchObject({ type: "date", config: { withTime: true } });
  expect(fieldOf("tasks", "due")?.config).toBeUndefined();
});

test("seeded select options and colours", () => {
  const values = (c: string, f: string) => fieldOf(c, f)?.options?.map((o) => o.value);
  expect(values("projects", "status")).toEqual(["active", "paused", "done", "dropped"]);
  expect(fieldOf("projects", "status")?.options?.map((o) => o.color)).toEqual([
    "#B6FF3B",
    "#F5C451",
    "#3DE0FF",
    "#FF5C7A",
  ]);
  expect(values("reminders", "repeat")).toEqual(["none", "daily", "weekly", "monthly", "yearly"]);
  expect(values("leetcode", "difficulty")).toEqual(["easy", "medium", "hard"]);
  expect(fieldOf("projects", "review")?.type).toBe("date");
});

test("every select option has an icon and a token colour", () => {
  for (const doc of collections) {
    for (const field of doc.data.fields as SeedField[]) {
      for (const o of field.options ?? []) {
        expect(o.icon).toMatch(/^[a-z0-9-]+$/);
        expect(o.color).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  }
});

test("fields and views use known types with unique ids", () => {
  for (const doc of collections) {
    const fields = doc.data.fields as { id: string; type: string }[];
    const views = doc.data.views as { id: string; type: string }[];
    expect(fields.every((f) => (FIELD_TYPES as readonly string[]).includes(f.type))).toBe(true);
    expect(views.every((v) => (VIEW_TYPES as readonly string[]).includes(v.type))).toBe(true);
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
    expect(new Set(views.map((v) => v.id)).size).toBe(views.length);
  }
});

test("money categories match the plan, each with icon and colour", () => {
  const fields = byId.get("money")?.data.fields as {
    id: string;
    options?: { value: string; icon: string; color: string }[];
  }[];
  const category = fields.find((f) => f.id === "category");
  expect(category?.options?.map((o) => o.value)).toEqual([
    "food",
    "home",
    "transport",
    "health",
    "fun",
    "other",
    "investment",
    "income",
    "transfer",
  ]);
  expect(category?.options?.every((o) => o.icon && /^#[0-9A-F]{6}$/.test(o.color))).toBe(true);
});

test("journal has one checkbox per habit", () => {
  const fields = byId.get("journal")?.data.fields as { id: string; type: string }[];
  const habits = fields.filter((f) => f.type === "checkbox").map((f) => f.id);
  expect(habits).toEqual([
    "gym",
    "supplements",
    "reading",
    "meditation",
    "water_2l",
    "protein",
    "creatine",
    "learning",
  ]);
});
