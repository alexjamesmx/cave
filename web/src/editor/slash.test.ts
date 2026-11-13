import { expect, test } from "bun:test";
import { slashMatches, slashQuery } from "./slash.ts";

test("the menu opens on a line that is only `/` and a word", () => {
  expect(slashQuery("/")).toBe("");
  expect(slashQuery("/che")).toBe("che");
  expect(slashQuery("/heading 2")).toBe("heading 2");
  expect(slashQuery("a/b")).toBeUndefined();
  expect(slashQuery("text /che")).toBeUndefined();
  expect(slashQuery("/path/to")).toBeUndefined();
});

test("a query finds blocks by the start of a word in their name or keywords", () => {
  expect(slashMatches("").length).toBeGreaterThan(10);
  expect(slashMatches("che").map((i) => i.id)).toEqual(["todo"]);
  expect(slashMatches("todo").map((i) => i.id)).toEqual(["todo"]);
  expect(slashMatches("list").map((i) => i.id)).toEqual(["todo", "bullets", "numbers"]);
  expect(slashMatches("mermaid").map((i) => i.id)).toEqual(["diagram"]);
  expect(slashMatches("zzz")).toEqual([]);
});
