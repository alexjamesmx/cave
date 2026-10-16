import { expect, test } from "bun:test";
import { seedDocs } from "../../../shared/seed.ts";
import { DATA_ONLY, DEFAULT_DOCK, dockOf, SECTIONS, sectionOf } from "./sections.ts";

test("eight sections, each once; every collection belongs to exactly one, or is Data-only", () => {
  expect(SECTIONS.map((s) => s.id)).toEqual([
    "home",
    "money",
    "calendar",
    "tasks",
    "projects",
    "life",
    "ai",
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
});

test("the dock: old ids map to their section, duplicates collapse, else the default", () => {
  const ids = (dock: unknown) => dockOf({ dock }).map((s) => s.id);
  expect(ids(undefined)).toEqual(DEFAULT_DOCK);
  expect(ids(["flows", "money", "system", "ideas"])).toEqual([
    "ai",
    "money",
    "settings",
    "projects",
  ]);
  expect(ids(["payments", "wealth", "tasks", "calendar"])).toEqual(DEFAULT_DOCK);
  expect(ids(["life", "money", "nope", "ai"])).toEqual(DEFAULT_DOCK);
  expect(ids(["life", "money", "projects", "ai"])).toEqual(["life", "money", "projects", "ai"]);
});

test("a path marks its section", () => {
  expect(sectionOf("/")).toBe("home");
  expect(sectionOf("/money/payments")).toBe("money");
  expect(sectionOf("/ai/flows/flow-rent")).toBe("ai");
  expect(sectionOf("/r/abc")).toBeUndefined();
});
