import { expect, test } from "bun:test";
import { COLOR_FIELD, colorToken, pagesMigration, TRACKER_FIELDS } from "./pages.ts";
import { DEFAULT_TEMPLATES } from "./projects.ts";
import type { Field } from "./schema.ts";
import { seedDocs } from "./seed.ts";
import type { Doc } from "./types.ts";

type SeedDoc = ReturnType<typeof pagesMigration>[number];
const byId = (docs: Doc[]) => new Map(docs.map((d) => [d.id, d]));
const fields = (d: Doc | undefined) => (d?.data.fields as Field[]) ?? [];

test("a fresh seed already holds the colour, the tracker fields and the study template", () => {
  const docs = byId(seedDocs());
  expect(fields(docs.get("notes")).some((f) => f.id === "color")).toBe(true);
  expect(fields(docs.get("journal")).some((f) => f.id === "color")).toBe(true);
  expect(fields(docs.get("leetcode")).map((f) => f.id)).toEqual(
    expect.arrayContaining(TRACKER_FIELDS.map((f) => f.id)),
  );
  expect(DEFAULT_TEMPLATES.study?.label).toBe("Study");
  expect(DEFAULT_TEMPLATES.learning?.tracker).toEqual({
    collection: "leetcode",
    label: "Problems",
  });
  expect(pagesMigration((id) => docs.get(id))).toEqual([]);
});

test("the migration adds only what is missing and keeps the owner's edits", () => {
  const docs = byId(seedDocs());
  const older = new Map(docs);
  const strip = (id: string, drop: string[]) => {
    const d = older.get(id) as Doc;
    older.set(id, {
      ...d,
      data: { ...d.data, fields: fields(d).filter((f) => !drop.includes(f.id)) },
    });
  };
  strip("notes", ["color"]);
  strip("leetcode", ["list", "url"]);
  const settings = older.get("settings") as Doc;
  const templates = { ...(settings.data.projectTemplates as Record<string, unknown>) };
  delete templates.study;
  templates.learning = { ...DEFAULT_TEMPLATES.learning, label: "My learning", tracker: undefined };
  older.set("settings", { ...settings, data: { ...settings.data, projectTemplates: templates } });

  const out = pagesMigration((id) => older.get(id));
  expect(out.map((d) => d.id)).toEqual(["notes", "leetcode", "settings"]);
  const [notes, leetcode, settingsOut] = out as [SeedDoc, SeedDoc, SeedDoc];
  expect((notes.data.fields as Field[]).at(-1)?.id).toBe("color");
  expect((leetcode.data.fields as Field[]).slice(-2).map((f) => f.id)).toEqual(["list", "url"]);
  const stored = settingsOut.data.projectTemplates as Record<
    string,
    { label: string; tracker?: unknown }
  >;
  expect(stored.study?.label).toBe("Study");
  expect(stored.learning).toMatchObject({
    label: "My learning",
    tracker: { collection: "leetcode", label: "Problems" },
  });
});

test("colour values map to the palette's tokens; anything else is no colour", () => {
  expect(COLOR_FIELD.options?.map((o) => o.value)).toContain("vio");
  expect(colorToken("vio")).toBe("var(--vio)");
  expect(colorToken("red")).toBeUndefined();
  expect(colorToken(undefined)).toBeUndefined();
});
