import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import {
  excerpt,
  groupByTopic,
  matchesNote,
  NO_TOPIC,
  notePath,
  topicOf,
  wikiResolver,
} from "./notes.ts";

const note = (id: string, data: Record<string, unknown> = {}): Doc => ({
  id,
  kind: "item",
  collection: "notes",
  data: { _title: id, ...data },
  stamps: {},
  actor: "user",
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

test("wikilinks: the nearby note first, else any note, opened in Notes", () => {
  const far = note("Plan");
  const near = note("plan");
  const resolve = wikiResolver([near], [far, near]);
  expect(resolve("PLAN")).toEqual({ href: notePath("plan") });
  expect(wikiResolver([], [far])("plan")).toEqual({ href: notePath("Plan") });
  expect(resolve("nothing")).toBeUndefined();
});
