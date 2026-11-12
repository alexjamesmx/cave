import { expect, test } from "bun:test";
import { SWATCHES } from "../../../shared/palette.ts";
import type { Doc } from "../../../shared/types.ts";
import { redirectOf } from "../app/router.ts";
import {
  captured,
  cardFace,
  excerpt,
  inTopic,
  matchesNote,
  noteColor,
  notePath,
  searchOf,
  splitEmoji,
  topicChip,
  topicColor,
  topicPath,
  topicTree,
  wikiResolver,
  writtenOn,
} from "./notes.ts";

const note = (id: string, data: Record<string, unknown> = {}): Doc => ({
  id,
  kind: "item",
  collection: "notes",
  data: { _title: id, ...data },
  stamps: {},
  actor: "user",
});

test("a topic holds its subtopics; All holds everything; Inbox holds notes with no topic too", () => {
  const kitchen = note("a", { folder: " Projects / Kitchen " });
  const loose = note("b");
  const inbox = note("c", { folder: "Inbox" });
  expect(inTopic(kitchen, "Projects")).toBe(true);
  expect(inTopic(kitchen, "Projects/Kitchen")).toBe(true);
  expect(inTopic(kitchen, "Proj")).toBe(false);
  expect(inTopic(kitchen, "")).toBe(true);
  expect([loose, inbox, kitchen].map((n) => inTopic(n, "Inbox"))).toEqual([true, true, false]);
  expect(inTopic(loose, "Ideas")).toBe(false);
});

test("the topic tree: A to Z by name (emoji ignored), each topic above its subtopics, counts include them", () => {
  const rows = topicTree([
    note("1", { folder: "🎓 School/Calculus" }),
    note("2", { folder: "Projects/Kitchen" }),
    note("3", { folder: "Projects/Kitchen" }),
    note("4", { folder: "projects 2" }),
    note("5", { folder: "Ideas" }),
    note("6", { folder: "Ideas/Later" }),
    note("7", { folder: "Inbox" }),
    note("8"),
    note("9", { folder: "Projects" }),
  ]);
  expect(rows.map((r) => [r.path, r.emoji, r.name, r.depth, r.count])).toEqual([
    ["Projects", "", "Projects", 0, 3],
    ["Projects/Kitchen", "", "Kitchen", 1, 2],
    ["projects 2", "", "projects 2", 0, 1],
    ["🎓 School", "🎓", "School", 0, 1],
    ["🎓 School/Calculus", "", "Calculus", 1, 1],
  ]);
});

test("a leading emoji splits off a topic name; a name that is only an emoji keeps it", () => {
  expect(splitEmoji("🏠 Home")).toEqual({ emoji: "🏠", name: "Home" });
  expect(splitEmoji("👩🏽‍💻Work")).toEqual({ emoji: "👩🏽‍💻", name: "Work" });
  expect(splitEmoji("❤️ Health")).toEqual({ emoji: "❤️", name: "Health" });
  expect(splitEmoji("Home 🏠")).toEqual({ emoji: "", name: "Home 🏠" });
  expect(splitEmoji("🏠")).toEqual({ emoji: "", name: "🏠" });
  expect(splitEmoji("2026 plans")).toEqual({ emoji: "", name: "2026 plans" });
});

test("a card's topic chip: Inbox and Ideas wear their own emoji, a path reads with slashes", () => {
  expect(topicChip("")).toEqual({ emoji: "📥", text: "Inbox" });
  expect(topicChip("Inbox")).toEqual({ emoji: "📥", text: "Inbox" });
  expect(topicChip("Ideas")).toEqual({ emoji: "💡", text: "Ideas" });
  expect(topicChip("🏠 Projects/Kitchen")).toEqual({ emoji: "🏠", text: "Projects / Kitchen" });
  expect(topicChip("Tech")).toEqual({ emoji: "", text: "Tech" });
});

test("a topic's colour is fixed by its name, shared with its subtopics, never grey; a note's own colour wins", () => {
  const swatches = Object.values(SWATCHES) as string[];
  expect(topicColor("Ideas")).toBe(SWATCHES.yellow);
  expect(topicColor("Ideas/Later")).toBe(SWATCHES.yellow);
  expect(topicColor("")).toBe(SWATCHES.sky);
  expect(topicColor("Inbox")).toBe(SWATCHES.sky);
  expect(topicColor("Projects/Kitchen")).toBe(topicColor("Projects"));
  for (const topic of ["Tech", "Projects/Kitchen", "🎓 School", "a", "b", "c", "d", "e"]) {
    expect(topicColor(topic)).toBe(topicColor(topic));
    expect(swatches).toContain(topicColor(topic));
    expect(topicColor(topic)).not.toBe(SWATCHES.grey);
  }
  expect(new Set(["a", "b", "c", "d", "e"].map(topicColor)).size).toBeGreaterThan(1);
  expect(noteColor(note("x", { folder: "Tech", color: "teal" }))).toBe("var(--teal)");
  expect(noteColor(note("x", { folder: "Tech", color: "nope" }))).toBe(topicColor("Tech"));
});

test("the capture bar: the first line is the title, the rest the body; a leading / searches", () => {
  expect(captured("  Buy oak boards  ")).toEqual({ title: "Buy oak boards", body: "" });
  expect(captured("Shelves\n\nOak, hidden brackets.\n- [ ] Measure\n")).toEqual({
    title: "Shelves",
    body: "Oak, hidden brackets.\n- [ ] Measure",
  });
  expect(captured(" \n ")).toBeUndefined();
  expect(searchOf("/ ryzen ")).toBe("ryzen");
  expect(searchOf("/")).toBe("");
  expect(searchOf("Ryzen / Intel")).toBeUndefined();
});

test("search finds title, topic and text, ignoring case and accents", () => {
  const n = note("Laptop specs", { folder: "Tech", _body: "Ryzen 7, 32 GB, garantía 2027" });
  expect(matchesNote(n, "laptop")).toBe(true);
  expect(matchesNote(n, "tech")).toBe(true);
  expect(matchesNote(n, "GARANTIA")).toBe(true);
  expect(matchesNote(n, "phone")).toBe(false);
  expect(matchesNote(n, "  ")).toBe(true);
});

test("an excerpt is plain text: marks, links and diagrams reduced, list items set apart", () => {
  expect(
    excerpt(
      "# Network\n\n```mermaid\ngraph LR\nA-->B\n```\n- **Router** at [the manual](https://x.example)\n- see [[Laptop specs|specs]]",
    ),
  ).toBe("Network ◇ diagram · Router at the manual · see specs");
  // An idea's fields, as migration 26 writes them, read as one line.
  expect(excerpt("Basil.\n\n- **Stage:** spark\n- **Area:** home")).toBe(
    "Basil. · Stage: spark · Area: home",
  );
  expect(excerpt("- **Stage:** spark\n1. two")).toBe("Stage: spark · two");
  expect(excerpt("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
  expect(excerpt("x".repeat(300), 10)).toBe(`${"x".repeat(9)}…`);
  expect(excerpt(undefined)).toBe("");
});

test("a card shows checklist items apart from the text", () => {
  expect(
    cardFace(
      "Wall: 180 cm. See [[Kitchen paint]].\n\n- [x] Measure\n- [ ] Buy **brackets**\n- plain",
    ),
  ).toEqual({
    text: "Wall: 180 cm. See Kitchen paint. · plain",
    checks: [
      { done: true, text: "Measure" },
      { done: false, text: "Buy brackets" },
    ],
  });
  expect(cardFace(undefined)).toEqual({ text: "", checks: [] });
});

test("when a note was written: Today, Yesterday, a day this year, or with its year", () => {
  const zone = "America/Mexico_City";
  // 05:00 UTC on Nov 12 is still Nov 11 in Mexico City.
  expect(writtenOn("2026-11-12T05:00:00.000Z", "2026-11-11", zone)).toBe("Today");
  expect(writtenOn("2026-11-12T05:00:00.000Z", "2026-11-12", zone)).toBe("Yesterday");
  expect(writtenOn("2026-03-01T18:00:00.000Z", "2026-11-12", zone)).toBe("Mar 1");
  expect(writtenOn("2025-12-31T18:00:00.000Z", "2026-01-02", zone)).toBe("Dec 31, 2025");
  expect(writtenOn(undefined, "2026-11-12", zone)).toBe("");
  expect(writtenOn("not a date", "2026-11-12", zone)).toBe("");
});

test("paths: a note keeps the open topic for the way back; a topic is a query; Ideas redirect there", () => {
  expect(notePath("01ABC")).toBe("/notes/all/01ABC");
  expect(notePath("01ABC", "?topic=Ideas")).toBe("/notes/all/01ABC?topic=Ideas");
  expect(topicPath("")).toBe("/notes/all");
  expect(topicPath("🏠 Home/Kitchen")).toBe(
    `/notes/all?topic=${encodeURIComponent("🏠 Home/Kitchen")}`,
  );
  expect(redirectOf("/ideas")).toBe(topicPath("Ideas"));
});

test("wikilinks: the nearby note first, else any note, opened in Notes", () => {
  const far = note("Plan");
  const near = note("plan");
  const resolve = wikiResolver([near], [far, near]);
  expect(resolve("PLAN")).toEqual({ href: notePath("plan") });
  expect(wikiResolver([], [far])("plan")).toEqual({ href: notePath("Plan") });
  expect(resolve("nothing")).toBeUndefined();
});
