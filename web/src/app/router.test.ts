import { expect, test } from "bun:test";
import { collectionPath, parseRoute, shortcutPath } from "./router.ts";

test("parses the app's routes", () => {
  expect(parseRoute("/")).toEqual({ name: "home" });
  expect(parseRoute("/settings")).toEqual({ name: "settings" });
  expect(parseRoute("/calendar")).toEqual({ name: "calendar" });
  expect(parseRoute("/agents")).toEqual({ name: "agents" });
  expect(parseRoute("/c/money")).toEqual({
    name: "collection",
    collection: "money",
    view: undefined,
  });
  expect(parseRoute("/c/money/untagged/")).toEqual({
    name: "collection",
    collection: "money",
    view: "untagged",
  });
  expect(parseRoute("/radar")).toEqual({ name: "not-found" });
  expect(parseRoute("/c/")).toEqual({ name: "not-found" });
});

test("collection paths round-trip", () => {
  expect(parseRoute(collectionPath("tasks", "board"))).toEqual({
    name: "collection",
    collection: "tasks",
    view: "board",
  });
});

test("C opens the calendar, except while typing or with a modifier", () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}, target: unknown = null) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...extra,
    target: target as EventTarget | null,
  });
  expect(shortcutPath(key("c"))).toBe("/calendar");
  expect(shortcutPath(key("C"))).toBe("/calendar");
  expect(shortcutPath(key("c", { ctrlKey: true }))).toBeUndefined();
  expect(shortcutPath(key("c", { metaKey: true }))).toBeUndefined();
  expect(shortcutPath(key("c", {}, { tagName: "INPUT" }))).toBeUndefined();
  expect(shortcutPath(key("c", {}, { tagName: "DIV", isContentEditable: true }))).toBeUndefined();
  expect(shortcutPath(key("x"))).toBeUndefined();
});
