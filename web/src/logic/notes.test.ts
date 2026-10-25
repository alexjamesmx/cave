import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import {
  excerpt,
  groupByTopic,
  looseNotes,
  matchesNote,
  NO_TOPIC,
  notePath,
  topicOf,
  wikiResolver,
} from "./notes.ts";

const doc = (id: string, collection: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection,
  data,
  stamps: {},
  actor: "user",
});
const note = (id: string, data: Record<string, unknown> = {}) =>
  doc(id, "notes", { _title: id, ...data });

test("loose notes: no project, or a project that is gone; deleted notes never", () => {
  const projects = [doc("p1", "projects", {}), doc("p2", "projects", { _deleted: true })];
  const notes = [
    note("free"),
    note("page", { project: "p1" }),
    note("orphan", { project: "p2" }),
    note("missing", { project: "p9" }),
    note("gone", { _deleted: true }),
  ];
  expect(looseNotes(notes, projects).map((n) => n.id)).toEqual(["free", "orphan", "missing"]);
});

test("topics A to Z with No topic last; each newest first", () => {
  const groups = groupByTopic([
    note("a", { folder: "Tech", _created: "2026-10-01" }),
    note("b", { _created: "2026-10-03" }),
    note("c", { folder: " School / Calculus ", _created: "2026-10-02" }),
    note("d", { folder: "Tech", _created: "2026-10-05" }),
  ]);
  expect(groups.map((g) => [g.topic, g.notes.map((n) => n.id)])).toEqual([
    ["School/Calculus", ["c"]],
    ["Tech", ["d", "a"]],
    [NO_TOPIC, ["b"]],
  ]);
  expect(topicOf(note("x", { folder: "" }))).toBe(NO_TOPIC);
});

test("search finds title, topic and text, ignoring case and accents", () => {
  const n = note("Laptop specs", { folder: "Tech", _body: "Ryzen 7, 32 GB, garantía 2027" });
  expect(matchesNote(n, "laptop")).toBe(true);
  expect(matchesNote(n, "tech")).toBe(true);
  expect(matchesNote(n, "GARANTIA")).toBe(true);
  expect(matchesNote(n, "phone")).toBe(false);
  expect(matchesNote(n, "  ")).toBe(true);
});

test("an excerpt is plain text: marks, links and diagrams reduced", () => {
  expect(
    excerpt(
      "# Network\n\n```mermaid\ngraph LR\nA-->B\n```\n- **Router** at [the manual](https://x.example)\n- see [[Laptop specs|specs]]",
    ),
  ).toBe("Network ◇ diagram Router at the manual see specs");
  expect(excerpt("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
  expect(excerpt("x".repeat(300), 10)).toBe(`${"x".repeat(9)}…`);
  expect(excerpt(undefined)).toBe("");
});

test("a note's path", () => {
  expect(notePath("01ABC")).toBe("/notes/all/01ABC");
});

test("wikilinks: the nearby note first, a live project's page in its project, else Notes", () => {
  const projects = [doc("p1", "projects", {}), doc("p2", "projects", { _deleted: true })];
  const page = note("Plan", { project: "p1" });
  const loose = note("plan");
  const orphan = note("Old", { project: "p2" });
  const resolve = wikiResolver([loose], [page, loose, orphan], projects);
  expect(resolve("PLAN")).toEqual({ href: notePath("plan") });
  expect(wikiResolver([], [page], projects)("plan")).toEqual({ href: "/projects/p1/pages/Plan" });
  expect(resolve("old")).toEqual({ href: notePath("Old") });
  expect(resolve("nothing")).toBeUndefined();
});
