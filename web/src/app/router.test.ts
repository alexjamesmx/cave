import { expect, test } from "bun:test";
import { collectionPath, parseRoute } from "./router.ts";

test("parses the app's routes", () => {
  expect(parseRoute("/")).toEqual({ name: "home" });
  expect(parseRoute("/settings")).toEqual({ name: "settings" });
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
