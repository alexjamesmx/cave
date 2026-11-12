import { expect, test } from "bun:test";
import { seedDocs } from "../../../shared/seed.ts";
import { DATA_ONLY, DOCK, LANDING, SECTIONS, sectionOf } from "./sections.ts";

test("five sections and Settings, each once; every collection belongs to exactly one, or is Data-only", () => {
  expect(SECTIONS.map((s) => s.id)).toEqual([
    "money",
    "tasks",
    "calendar",
    "notes",
    "flows",
    "settings",
  ]);
  // Each wears an emoji and a hex colour; no tab carries a description (M14).
  for (const s of SECTIONS) {
    expect(s.emoji.length).toBeGreaterThan(0);
    expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
    for (const t of s.tabs) expect(Object.keys(t)).not.toContain("description");
  }
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

test("the dock is the four everyday sections, in order", () => {
  expect(DOCK.map((s) => s.id)).toEqual(["money", "tasks", "calendar", "notes"]);
});

test("a path marks its section", () => {
  expect(sectionOf("/")).toBe("money");
  expect(sectionOf("/money/subscriptions")).toBe("money");
  expect(sectionOf("/flows/flow-rent")).toBe("flows");
  expect(sectionOf("/notes/write")).toBe("notes");
  expect(sectionOf("/notes/leetcode")).toBe("notes");
  expect(sectionOf("/r/abc")).toBeUndefined();
});
