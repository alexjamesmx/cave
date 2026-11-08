import { expect, test } from "bun:test";
import { seedDocs } from "../../../shared/seed.ts";
import { DATA_ONLY, DEFAULT_DOCK, dockOf, LANDING, SECTIONS, sectionOf } from "./sections.ts";

test("six sections and Settings, each once; every collection belongs to exactly one, or is Data-only", () => {
  expect(SECTIONS.map((s) => s.id)).toEqual([
    "money",
    "calendar",
    "flows",
    "ideas",
    "notes",
    "tasks",
    "settings",
  ]);
  const collections = seedDocs()
    .filter((d) => d.kind === "collection")
    .map((d) => d.id);
  for (const id of collections) {
    const owners = SECTIONS.filter((s) => s.owns.includes(id)).length;
    expect([id, owners + (DATA_ONLY.includes(id) ? 1 : 0)]).toEqual([id, 1]);
  }
  // Every tab that shows a collection shows one its section owns.
  for (const s of SECTIONS)
    for (const t of s.tabs) if (t.kind === "view") expect(s.owns).toContain(t.collection);
  // The app opens on a section's tab.
  const [, section, tab] = LANDING.split("/");
  expect(SECTIONS.find((s) => s.id === section)?.tabs.some((t) => t.id === tab)).toBe(true);
});

test("the dock: old ids map to their section, duplicates collapse, else the default", () => {
  const ids = (dock: unknown) => dockOf({ dock }).map((s) => s.id);
  expect(ids(undefined)).toEqual(DEFAULT_DOCK);
  expect(ids(["flows", "money", "system", "leetcode"])).toEqual([
    "flows",
    "money",
    "settings",
    "ideas",
  ]);
  expect(ids(["agents", "money", "life", "projects"])).toEqual([
    "settings",
    "money",
    "notes",
    "ideas",
  ]);
  expect(ids(["payments", "wealth", "tasks", "calendar"])).toEqual(DEFAULT_DOCK);
  expect(ids(["life", "money", "nope", "tasks"])).toEqual(DEFAULT_DOCK);
  // Home (gone in M11), the AI section (gone in M10) and Projects were dock ids too.
  // Home and money collapse to one section, so three are left and the default applies.
  expect(ids(["home", "money", "projects", "ai"])).toEqual(DEFAULT_DOCK);
  expect(ids(["home", "tasks", "projects", "ai"])).toEqual(["money", "tasks", "ideas", "settings"]);
});

test("a path marks its section", () => {
  expect(sectionOf("/")).toBe("money");
  expect(sectionOf("/money/subscriptions")).toBe("money");
  expect(sectionOf("/flows/flow-rent")).toBe("flows");
  expect(sectionOf("/notes/write")).toBe("notes");
  expect(sectionOf("/ideas/leetcode")).toBe("ideas");
  expect(sectionOf("/r/abc")).toBeUndefined();
});
