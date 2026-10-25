import { expect, test } from "bun:test";
import type { CollectionData } from "./schema.ts";
import { seedDocs } from "./seed.ts";
import { tasksCalendarMigration } from "./tasks.ts";
import type { Doc } from "./types.ts";

const byId = (docs: Doc[]) => new Map(docs.map((d) => [d.id, d]));

test("migration 21 drops the seed's Tasks calendar view, keeps the owner's, and is a no-op on a fresh seed", () => {
  const docs = byId(seedDocs());
  expect(tasksCalendarMigration((id) => docs.get(id))).toEqual([]);
  const tasks = docs.get("tasks") as Doc;
  const views = (tasks.data as unknown as CollectionData).views;
  const older = new Map(docs);
  older.set("tasks", {
    ...tasks,
    data: {
      ...tasks.data,
      views: [
        ...views,
        { id: "calendar", name: "Calendar", type: "calendar", config: { dateField: "due" } },
        { id: "mine", name: "Due by week", type: "calendar", config: { dateField: "due" } },
      ],
    },
  });
  const out = tasksCalendarMigration((id) => older.get(id));
  expect(out).toHaveLength(1);
  expect(((out[0]?.data.views ?? []) as { id: string }[]).map((v) => v.id)).toEqual([
    "board",
    "table",
    "mine",
  ]);
});
