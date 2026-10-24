import { expect, test } from "bun:test";
import { seedDocs } from "../../../shared/seed.ts";
import { DATA_ONLY, DEFAULT_DOCK, dockOf, LANDING, SECTIONS, sectionOf } from "./sections.ts";

test("six sections and Settings, each once; every collection belongs to exactly one, or is Data-only", () => {
  expect(SECTIONS.map((s) => s.id)).toEqual([
    "money",
    "calendar",
    "flows",
    "projects",
    "diary",
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
  expect(ids(["flows", "money", "system", "ideas"])).toEqual([
    "flows",
    "money",
    "settings",
    "projects",
  ]);
  expect(ids(["agents", "money", "life", "ideas"])).toEqual([
    "settings",
    "money",
    "diary",
    "projects",
  ]);
  expect(ids(["payments", "wealth", "tasks", "calendar"])).toEqual(DEFAULT_DOCK);
  expect(ids(["life", "money", "nope", "tasks"])).toEqual(DEFAULT_DOCK);
  // Home (gone in M11) and the AI section (gone in M10) were dock ids too.
  expect(ids(["home", "money", "projects", "ai"])).toEqual(DEFAULT_DOCK);
  expect(ids(["home", "money", "diary", "ai"])).toEqual(["projects", "money", "diary", "settings"]);
});

test("a path marks its section", () => {
  expect(sectionOf("/")).toBe("projects");
  expect(sectionOf("/money/payments")).toBe("money");
  expect(sectionOf("/flows/flow-rent")).toBe("flows");
  expect(sectionOf("/diary/write")).toBe("diary");
  expect(sectionOf("/projects/activity")).toBe("projects");
  expect(sectionOf("/r/abc")).toBeUndefined();
});
