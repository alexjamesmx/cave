import { expect, test } from "bun:test";
import { DEFAULT_DOCK, dockOf, SECTIONS, sectionOf } from "./sections.ts";

test("the dock is four distinct known sections, else the default", () => {
  const ids = (s: Record<string, unknown> | undefined) => dockOf(s).map((x) => x.id);
  expect(ids(undefined)).toEqual(DEFAULT_DOCK);
  expect(ids({ dock: ["flows", "ideas", "money", "system"] })).toEqual([
    "flows",
    "ideas",
    "money",
    "system",
  ]);
  expect(ids({ dock: ["flows", "flows", "money", "system"] })).toEqual(DEFAULT_DOCK);
  expect(ids({ dock: ["flows", "nope", "money", "system"] })).toEqual(DEFAULT_DOCK);
  expect(ids({ dock: ["flows", "money"] })).toEqual(DEFAULT_DOCK);
  expect(ids({ dock: "money" })).toEqual(DEFAULT_DOCK);
});

test("a path marks its section, the most specific first", () => {
  expect(sectionOf("/")).toBe("home");
  expect(sectionOf("/c/money/dashboard")).toBe("money");
  expect(sectionOf("/flows/flow-rent")).toBe("flows");
  expect(sectionOf("/settings")).toBe("settings");
  expect(sectionOf("/r/abc")).toBeUndefined();
  expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
});
