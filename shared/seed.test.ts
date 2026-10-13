import { expect, test } from "bun:test";
import { SEED_STAMP } from "./hlc.ts";
import { FIELD_TYPES, VIEW_TYPES } from "./schema.ts";
import { seedDocs } from "./seed.ts";

const docs = seedDocs();
const byId = new Map(docs.map((d) => [d.id, d]));

test("seeds the eight collections from the plan", () => {
  expect([...byId.keys()].sort()).toEqual(
    ["ideas", "journal", "leetcode", "money", "projects", "reminders", "tasks", "wealth"].sort(),
  );
});

test("every key is stamped with time 0 so any edit wins", () => {
  for (const doc of docs) {
    expect(doc.kind).toBe("collection");
    expect(doc.collection).toBeNull();
    expect(Object.keys(doc.stamps).sort()).toEqual(Object.keys(doc.data).sort());
    expect(Object.values(doc.stamps).every((s) => s === SEED_STAMP)).toBe(true);
  }
});

test("fields and views use known types with unique ids", () => {
  for (const doc of docs) {
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
