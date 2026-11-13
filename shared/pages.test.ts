import { expect, test } from "bun:test";
import { COLOR_FIELD, colorToken, pagesMigration, TRACKER_FIELDS } from "./pages.ts";
import type { Field } from "./schema.ts";
import { seedDocs } from "./seed.ts";
import type { Doc } from "./types.ts";

type SeedDoc = ReturnType<typeof pagesMigration>[number];
const byId = (docs: Doc[]) => new Map(docs.map((d) => [d.id, d]));
const fields = (d: Doc | undefined) => (d?.data.fields as Field[]) ?? [];

// The leetcode collection as M2 seeded it, before the tracker fields; fresh seeds lack it (27).
const lcCollection = (data: Record<string, unknown>): Doc => ({
  id: "leetcode",
  kind: "collection",
  collection: null,
  data: { name: "LeetCode", fields: [{ id: "number", name: "Number", type: "number" }], ...data },
  stamps: {},
  actor: "seed",
});

test("a fresh seed already holds the colour and has no leetcode: nothing to add", () => {
  const docs = byId(seedDocs());
  expect(fields(docs.get("notes")).some((f) => f.id === "color")).toBe(true);
  expect(fields(docs.get("journal")).some((f) => f.id === "color")).toBe(true);
  expect(docs.get("leetcode")).toBeUndefined();
  expect(pagesMigration((id) => docs.get(id))).toEqual([]);
});

test("the migration adds only what is missing and keeps the owner's edits", () => {
  const docs = byId(seedDocs());
  const older = new Map(docs);
  older.set(
    "leetcode",
    lcCollection({ fields: [{ id: "number", name: "Number", type: "number" }, ...TRACKER_FIELDS] }),
  );
  const strip = (id: string, drop: string[]) => {
    const d = older.get(id) as Doc;
    older.set(id, {
      ...d,
      data: { ...d.data, fields: fields(d).filter((f) => !drop.includes(f.id)) },
    });
  };
  strip("notes", ["color"]);
  strip("leetcode", ["list", "url"]);

  const out = pagesMigration((id) => older.get(id));
  expect(out.map((d) => d.id)).toEqual(["notes", "leetcode"]);
  const [notes, leetcode] = out as [SeedDoc, SeedDoc];
  expect((notes.data.fields as Field[]).at(-1)?.id).toBe("color");
  expect((leetcode.data.fields as Field[]).slice(-2).map((f) => f.id)).toEqual(["list", "url"]);
});

test("a retired leetcode collection gets no tracker fields", () => {
  const docs = byId(seedDocs());
  docs.set("leetcode", lcCollection({ _deleted: true }));
  expect(pagesMigration((id) => docs.get(id))).toEqual([]);
  docs.set("leetcode", lcCollection({}));
  expect(pagesMigration((id) => docs.get(id)).map((d) => d.id)).toEqual(["leetcode"]);
});

test("colour values map to the palette's tokens; anything else is no colour", () => {
  expect(COLOR_FIELD.options?.map((o) => o.value)).toContain("vio");
  expect(colorToken("vio")).toBe("var(--vio)");
  expect(colorToken("red")).toBeUndefined();
  expect(colorToken(undefined)).toBeUndefined();
});
