import { expect, test } from "bun:test";
import { apply, insertLink, toggleLinePrefix, wrap } from "./markdown-edit.ts";

test("wrap surrounds the selection, or a placeholder, and selects the inner text", () => {
  expect(wrap("hello world", 6, 11, "**", "**")).toEqual({
    text: "hello **world**",
    start: 8,
    end: 13,
  });
  expect(wrap("hello ", 6, 6, "_", "_")).toEqual({ text: "hello _text_", start: 7, end: 11 });
});

test("a line prefix goes on every selected line and comes off again; headings swap levels", () => {
  const text = "one\ntwo\nthree";
  const listed = toggleLinePrefix(text, 0, 7, "- ");
  expect(listed.text).toBe("- one\n- two\nthree");
  expect([listed.start, listed.end]).toEqual([0, 11]);
  expect(toggleLinePrefix(listed.text, 0, 11, "- ").text).toBe(text);
  expect(toggleLinePrefix("# Title", 2, 2, "## ").text).toBe("## Title");
  expect(toggleLinePrefix("## Title", 0, 0, "## ").text).toBe("Title");
  expect(toggleLinePrefix("- a\nb", 0, 5, "- ").text).toBe("- a\n- b");
});

test("a link wraps the selection and selects the URL to type over; code picks a fence for several lines", () => {
  expect(insertLink("see docs", 4, 8)).toEqual({
    text: "see [docs](https://)",
    start: 11,
    end: 19,
  });
  expect(apply("code", "a\nb", 0, 3).text).toBe("```\na\nb\n```");
  expect(apply("code", "x", 0, 1).text).toBe("`x`");
  expect(apply("checklist", "buy milk", 0, 0).text).toBe("- [ ] buy milk");
  expect(apply("quote", "said", 0, 4).text).toBe("> said");
});
