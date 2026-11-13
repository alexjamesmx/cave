import { expect, test } from "bun:test";
import { looksLikeMarkdown, noteMarkdown, parseNote } from "./markdown.ts";

const roundTrip = (md: string) => noteMarkdown(parseNote(md));

test("plain Markdown comes back as it was written", () => {
  const md = [
    "# Title",
    "",
    "Some **bold**, *italic*, ~~strike~~ and `code`, a [link](https://example.com).",
    "",
    "- one",
    "- two",
    "  - nested",
    "",
    "1. first",
    "2. second",
    "",
    "> a quote",
    "",
    "```ts",
    "const x = a < b && c > d;",
    "```",
    "",
    "---",
    "",
    "Line one",
    "Line two",
  ].join("\n");
  expect(roundTrip(md)).toBe(md);
});

test("checkboxes are a task list, ticked or not, nested too", () => {
  const md = "- [ ] todo\n- [x] done\n  - [ ] sub-step";
  const doc = parseNote(md);
  expect(doc.content?.[0]?.type).toBe("taskList");
  expect(doc.content?.[0]?.content?.map((i) => i.attrs?.checked)).toEqual([false, true]);
  expect(roundTrip(md)).toBe(md);
});

test("the Cave's own marks survive: wikilinks, colours, highlights, diagrams", () => {
  const md = [
    "See [[Some Note]] and [[Other|the label]], :red[late bill] and ==marked== text.",
    "",
    "```mermaid",
    "graph TD; A-->B",
    "```",
  ].join("\n");
  const doc = parseNote(md);
  const inline = doc.content?.[0]?.content ?? [];
  expect(inline.filter((n) => n.type === "wikilink").map((n) => n.attrs)).toEqual([
    { title: "Some Note", label: null },
    { title: "Other", label: "the label" },
  ]);
  expect(inline.some((n) => n.marks?.some((m) => m.type === "textColor"))).toBe(true);
  expect(inline.some((n) => n.marks?.some((m) => m.type === "highlight"))).toBe(true);
  expect(roundTrip(md)).toBe(md);
});

test("tables, images and raw HTML are kept, never dropped", () => {
  // Tiptap pads the columns to line up; the cells are the same.
  const padded = "| a   | b   |\n| --- | --- |\n| 1   | 2   |";
  expect(roundTrip("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(padded);
  expect(roundTrip(padded)).toBe(padded);
  expect(parseNote(padded).content?.[0]?.type).toBe("table");
  expect(roundTrip("![a photo](https://example.com/a.png)")).toBe(
    "![a photo](https://example.com/a.png)",
  );
  const html = parseNote("<div>raw html</div>");
  expect(html.content?.[0]).toEqual({
    type: "paragraph",
    content: [{ type: "text", text: "<div>raw html</div>" }],
  });
  expect(roundTrip("<div>raw html</div>")).toBe("&lt;div>raw html&lt;/div>");
});

test("text stays readable: entities and escapes only where Markdown needs them", () => {
  expect(roundTrip("Arrays & hashing, 2 < 3 and 5 > 4")).toBe("Arrays & hashing, 2 < 3 and 5 > 4");
  const typed = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "a *star*, snake_case, &amp; and <b>" }],
      },
    ],
  };
  const md = noteMarkdown(typed);
  expect(md).toBe("a \\*star\\*, snake\\_case, &amp;amp; and &lt;b>");
  expect(parseNote(md).content?.[0]?.content).toEqual(typed.content[0]?.content);
});

test("empty paragraphs are blank lines, not &nbsp;", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph" },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ],
  };
  expect(noteMarkdown(doc)).toBe("a\n\nb");
});

test("pasted text is formatted when it reads as Markdown", () => {
  for (const md of [
    "# Plan",
    "- [ ] milk",
    "1. first",
    "> quoted",
    "**bold**",
    "[[Note]]",
    "[a](https://x.test)",
    "```\ncode\n```",
  ])
    expect(looksLikeMarkdown(md)).toBe(true);
  for (const plain of ["just a sentence", "2 * 3 = 6", "a - b", "x == y"])
    expect(looksLikeMarkdown(plain)).toBe(false);
});
