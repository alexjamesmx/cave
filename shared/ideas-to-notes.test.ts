import { expect, test } from "bun:test";
import { ideaBody, ideasToNotesMigration, noteIdOf } from "./ideas-to-notes.ts";
import { isDocId } from "./ids.ts";
import type { Field } from "./schema.ts";
import type { Doc } from "./types.ts";

const doc = (
  id: string,
  kind: Doc["kind"],
  collection: string | null,
  data: Record<string, unknown>,
): Doc => ({ id, kind, collection, data, stamps: {}, actor: "user:phone" });

// The ideas collection as M13 left it, plus a field the owner added and one archived by 24.
const FIELDS: Field[] = [
  {
    id: "stage",
    name: "Stage",
    type: "select",
    options: [
      { value: "spark", icon: "sparkles", color: "#F5B94A" },
      { value: "exploring", icon: "compass", color: "#2DD4BF", label: "Exploring", emoji: "🧭" },
    ],
  },
  { id: "area", name: "Area", type: "text" },
  { id: "next_step", name: "Next step", type: "text" },
  { id: "budget", name: "Budget", type: "money" },
  { id: "by", name: "By", type: "date" },
  { id: "urgent", name: "Urgent", type: "checkbox" },
  { id: "link", name: "Link", type: "url" },
  {
    id: "project",
    name: "Project",
    type: "ref",
    archived: true,
    config: { collection: "projects" },
  },
];

const IDEA_ID = "01JB0000000000000000000000";

function world(ideas: Doc[], extra: Doc[] = []) {
  const docs = new Map<string, Doc>(
    [
      doc("ideas", "collection", null, { name: "Ideas", fields: FIELDS }),
      doc("p1", "item", "projects", { _title: "Kitchen", _deleted: true }),
      ...ideas,
      ...extra,
    ].map((d) => [d.id, d]),
  );
  const get = (id: string) => docs.get(id);
  const items = (c: string) =>
    [...docs.values()].filter((d) => d.collection === c && d.data._deleted !== true);
  return { get, items, docs };
}

test("every non-empty field lands in the body: the idea's text, then a line each in field order", () => {
  const idea = doc(IDEA_ID, "item", "ideas", {
    _title: "Balcony herb garden",
    _body: "Basil, mint.\n",
    _created: "2026-10-02T15:00:00.000Z",
    _order: 3,
    stage: "exploring",
    area: "home",
    next_step: "Measure the balcony\nthen buy pots",
    budget: 450,
    by: "2026-12-01",
    urgent: true,
    link: "https://example.test/herbs",
    project: "p1",
    legacy: "kept anyway",
  });
  const { get, items } = world([idea]);
  const [note] = ideasToNotesMigration(get, items);
  expect(note).toEqual({
    id: `note-from-${IDEA_ID.toLowerCase()}`,
    kind: "item",
    collection: "notes",
    data: {
      _title: "Balcony herb garden",
      _body: [
        "Basil, mint.",
        "",
        "- **Stage:** 🧭 Exploring",
        "- **Area:** home",
        "- **Next step:** Measure the balcony\n  then buy pots",
        "- **Budget:** 450",
        "- **By:** 2026-12-01",
        "- **Urgent:** yes",
        "- **Link:** https://example.test/herbs",
        "- **Project:** Kitchen",
        "- **legacy:** kept anyway",
      ].join("\n"),
      _created: "2026-10-02T15:00:00.000Z",
      folder: "Ideas",
      source: "owner",
    },
  });
});

test("empty values make no line; a bare option shows its value; no body means fields only", () => {
  const idea = doc("s-idea-x", "item", "ideas", {
    _title: "  Shelves  ",
    stage: "spark",
    area: "  ",
    next_step: "",
    urgent: false,
    by: null,
    project: "gone",
  });
  const { get } = world([]);
  expect(ideaBody(idea, FIELDS, get)).toBe("- **Stage:** spark\n- **Project:** gone");
  expect(ideaBody(doc("y", "item", "ideas", { _title: "Only a title" }), FIELDS, get)).toBe("");
});

test("a title-less idea, an agent's idea: a fallback title, source agent, the author kept", () => {
  const { get, items } = world([
    doc("s-idea-a", "item", "ideas", { _addedBy: "claude" }),
    doc("s-idea-b", "item", "ideas", { _title: "Mine", _addedBy: "" }),
  ]);
  const notes = ideasToNotesMigration(get, items).filter((d) => d.collection === "notes");
  expect(notes.map((n) => n.data)).toEqual([
    { _title: "Untitled idea", _addedBy: "claude", folder: "Ideas", source: "agent" },
    { _title: "Mine", folder: "Ideas", source: "owner" },
  ]);
});

test("ideas and the collection are marked deleted; a deleted idea is skipped; pending proposals follow", () => {
  const { get, items } = world(
    [
      doc("s-idea-a", "item", "ideas", { _title: "A" }),
      doc("s-idea-gone", "item", "ideas", { _title: "Gone", _deleted: true }),
    ],
    [
      doc("prop-1", "item", "proposals", { target: "s-idea-a", status: "pending" }),
      doc("prop-2", "item", "proposals", { target: "s-idea-a", status: "declined" }),
      doc("prop-3", "item", "proposals", { target: "t1", status: "pending" }),
    ],
  );
  expect(ideasToNotesMigration(get, items).map((d) => [d.id, d.data])).toEqual([
    ["note-from-s-idea-a", { _title: "A", folder: "Ideas", source: "owner" }],
    ["s-idea-a", { _deleted: true }],
    ["ideas", { _deleted: true }],
    ["prop-1", { target: "note-from-s-idea-a" }],
  ]);
});

test("no ideas: only the collection is retired; no collection, or a retired one: nothing", () => {
  const empty = world([]);
  expect(ideasToNotesMigration(empty.get, empty.items)).toEqual([
    { id: "ideas", kind: "collection", data: { _deleted: true } },
  ]);
  expect(
    ideasToNotesMigration(
      () => undefined,
      () => [],
    ),
  ).toEqual([]);
  const retired = world([doc("s-idea-a", "item", "ideas", { _title: "A" })]);
  retired.docs.set("ideas", doc("ideas", "collection", null, { _deleted: true }));
  expect(ideasToNotesMigration(retired.get, retired.items)).toEqual([]);
});

test("running it on its own output writes nothing; a note already at the derived id is left alone", () => {
  const w = world([doc("s-idea-a", "item", "ideas", { _title: "A" })]);
  for (const d of ideasToNotesMigration(w.get, w.items)) {
    const before = w.docs.get(d.id);
    w.docs.set(d.id, doc(d.id, d.kind, d.collection ?? null, { ...before?.data, ...d.data }));
  }
  expect(w.items("notes").map((n) => n.id)).toEqual(["note-from-s-idea-a"]);
  expect(ideasToNotesMigration(w.get, w.items)).toEqual([]);

  const kept = world(
    [doc("s-idea-a", "item", "ideas", { _title: "A" })],
    [doc("note-from-s-idea-a", "item", "notes", { _title: "Edited" })],
  );
  expect(ideasToNotesMigration(kept.get, kept.items).map((d) => d.id)).toEqual([
    "s-idea-a",
    "ideas",
  ]);
});

test("a note id is derived from the idea id and is always a valid doc id", () => {
  expect(noteIdOf(IDEA_ID)).toBe(`note-from-${IDEA_ID.toLowerCase()}`);
  expect(noteIdOf("s-idea-garden")).toBe("note-from-s-idea-garden");
  const long = `a${"b".repeat(60)}`;
  expect(noteIdOf(long)).toBe(noteIdOf(long));
  expect(noteIdOf(long)).not.toBe(noteIdOf(`${long}c`));
  for (const id of [IDEA_ID, "s-idea-garden", long, `imp-${"0".repeat(40)}`])
    expect([id, isDocId(noteIdOf(id))]).toEqual([id, true]);
});
