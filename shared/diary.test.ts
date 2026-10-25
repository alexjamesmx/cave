import { expect, test } from "bun:test";
import { diaryMigration, habitIconsOf, habitId } from "./diary.ts";
import type { CollectionData } from "./schema.ts";
import { seedDocs } from "./seed.ts";
import type { Doc } from "./types.ts";

const byId = (docs: Doc[]) => new Map(docs.map((d) => [d.id, d]));
const viewsOf = (d: Doc | undefined) => ((d?.data ?? {}) as unknown as CollectionData).views ?? [];

test("a fresh seed has only the Write view and the icons as a setting; the migration has nothing to do", () => {
  const docs = byId(seedDocs());
  expect(viewsOf(docs.get("journal")).map((v) => v.id)).toEqual(["write"]);
  expect(habitIconsOf(docs.get("settings")?.data)).toMatchObject({ gym: "dumbbell" });
  expect(diaryMigration((id) => docs.get(id))).toEqual([]);
});

test("an older journal loses the seed's Habits and Gallery views; icons move to settings; the owner's own view stays", () => {
  const docs = byId(seedDocs());
  const journal = docs.get("journal") as Doc;
  const settings = docs.get("settings") as Doc;
  const older = new Map(docs);
  older.set("journal", {
    ...journal,
    data: {
      ...journal.data,
      views: [
        { id: "write", name: "Write", type: "write", config: {} },
        { id: "gallery", name: "Gallery", type: "gallery", config: {} },
        {
          id: "habits",
          name: "Habits",
          type: "habits",
          config: {
            habits: [
              { id: "gym", icon: "dumbbell" },
              { id: "reading", icon: "book" },
            ],
          },
        },
        { id: "mine", name: "My table", type: "table", config: {} },
      ],
    },
  });
  const { habitIcons: _, ...rest } = settings.data;
  older.set("settings", { ...settings, data: rest });

  const out = diaryMigration((id) => older.get(id));
  expect(out.map((d) => d.id)).toEqual(["journal", "settings"]);
  expect(((out[0]?.data.views ?? []) as { id: string }[]).map((v) => v.id)).toEqual([
    "write",
    "mine",
  ]);
  expect(out[1]?.data.habitIcons).toEqual({ gym: "dumbbell", reading: "book" });

  // Icons the owner already set are kept.
  older.set("settings", { ...settings, data: { ...rest, habitIcons: { gym: "bike" } } });
  expect(diaryMigration((id) => older.get(id)).map((d) => d.id)).toEqual(["journal"]);
});

test("habit ids come from names; malformed icons are ignored", () => {
  expect(habitId("LeetCode grind")).toBe("leetcode_grind");
  expect(habitId("Chinese (中文) 30′")).toBe("chinese_30");
  expect(habitId("!!!")).toBe("habit");
  expect(habitIconsOf({ habitIcons: { gym: "dumbbell", bad: 3, empty: "" } })).toEqual({
    gym: "dumbbell",
  });
  expect(habitIconsOf({ habitIcons: ["x"] })).toEqual({});
});
