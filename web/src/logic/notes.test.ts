import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import {
  folderTree,
  inFolder,
  lastStamp,
  links,
  noteByTitle,
  recentNotes,
  searchNotes,
} from "./notes.ts";

const note = (
  id: string,
  title: string,
  body: string,
  folder = "",
  extra: Record<string, unknown> = {},
  stamp = "0000000000001:0000:t",
): Doc => ({
  id,
  kind: "item",
  collection: "notes",
  data: { _title: title, _body: body, folder, ...extra },
  stamps: { _title: stamp },
  actor: "user:t",
});

const notes = [
  note("n1", "Plan de acción", "Primero la acción, luego la revisión. Acción!", "Projects/Cave"),
  note("n2", "Ideas sueltas", "Una lista sin orden. Ver [[Plan de acción]].", "Inbox"),
  note("n3", "Recetas", "Nada que ver con la accion de hoy", "Life"),
  note("n4", "Borrada", "accion", "Inbox", { _deleted: true }),
  note("n5", "LeetCode", "[[plan de ACCIÓN|el plan]] y [[Nada]]", "Projects/LeetCode"),
];

test("search ignores case and accents, ranks title matches first, then body hits, with a snippet", () => {
  const hits = searchNotes(notes, "accion");
  // n1 matches its title; the others match once in the body each and keep their order.
  expect(hits.map((h) => h.doc.id)).toEqual(["n1", "n2", "n3", "n5"]);
  expect(hits[0]?.inTitle).toBe(true);
  expect(hits.find((h) => h.doc.id === "n3")?.snippet).toContain("accion de hoy");
  expect(searchNotes(notes, "revisión primero").map((h) => h.doc.id)).toEqual(["n1"]);
  expect(searchNotes(notes, "  ")).toEqual([]);
});

test("the folder tree counts notes under each folder, Inbox first", () => {
  const tree = folderTree(notes);
  expect(tree.map((n) => [n.path, n.count])).toEqual([
    ["Inbox", 1],
    ["Life", 1],
    ["Projects", 2],
  ]);
  expect(tree[2]?.children.map((n) => [n.path, n.count])).toEqual([
    ["Projects/Cave", 1],
    ["Projects/LeetCode", 1],
  ]);
  expect(inFolder(notes, "Projects").map((n) => n.id)).toEqual(["n1", "n5"]);
});

test("wikilinks resolve by title ignoring case; backlinks list who links here", () => {
  expect(noteByTitle(notes, "PLAN DE ACCIÓN")?.id).toBe("n1");
  const { outgoing, backlinks } = links(notes, notes[4] as Doc);
  expect(outgoing.map((o) => [o.title, o.doc?.id])).toEqual([
    ["plan de ACCIÓN", "n1"],
    ["Nada", undefined],
  ]);
  expect(backlinks).toEqual([]);
  expect(links(notes, notes[0] as Doc).backlinks.map((n) => n.id)).toEqual(["n2", "n5"]);
});

test("recent notes are the five changed last", () => {
  const many = Array.from({ length: 7 }, (_, i) =>
    note(`r${i}`, `Note ${i}`, "", "", {}, `000000000000${i}:0000:t`),
  );
  expect(recentNotes(many, lastStamp).map((n) => n.id)).toEqual(["r6", "r5", "r4", "r3", "r2"]);
});
