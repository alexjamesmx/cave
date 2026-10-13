import { expect, test } from "bun:test";
import { parseNote } from "./frontmatter.ts";

test("splits frontmatter from the body and keeps YAML scalar types", () => {
  const note = parseNote(
    '---\ndate: 2026-10-01T13:05:00\namount: 250.5\ngym: false\ndue:\ndetail: "a: b"\n---\n# Title\n\nText\n',
  );
  expect(note.frontmatter).toEqual({
    date: "2026-10-01T13:05:00",
    amount: 250.5,
    gym: false,
    due: null,
    detail: "a: b",
  });
  expect(note.body).toBe("# Title\n\nText\n");
});

test("handles CRLF, a BOM and block scalars", () => {
  const note = parseNote("﻿---\r\nstatus: |-\r\n  \r\n  queued \r\n---\r\nbody");
  expect(note.frontmatter.status).toBe("\nqueued ");
  expect(note.body).toBe("body");
});

test("a note without frontmatter is all body", () => {
  expect(parseNote("just text")).toEqual({ frontmatter: {}, body: "just text" });
});

test("invalid YAML throws", () => {
  expect(() => parseNote("---\na: [1\n---\n")).toThrow();
});
