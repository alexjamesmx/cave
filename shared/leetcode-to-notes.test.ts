import { expect, test } from "bun:test";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { isDocId } from "./ids.ts";
import {
  inline,
  LEETCODE_NOTE,
  leetcodeBody,
  leetcodeToNotesMigration,
} from "./leetcode-to-notes.ts";
import { TRACKER_FIELDS } from "./pages.ts";
import type { Field } from "./schema.ts";
import type { Doc } from "./types.ts";

const doc = (
  id: string,
  kind: Doc["kind"],
  collection: string | null,
  data: Record<string, unknown>,
): Doc => ({ id, kind, collection, data, stamps: {}, actor: "user:phone" });

const option = (value: string, label?: string) => ({
  value,
  icon: "circle",
  color: "#000000",
  ...(label ? { label } : {}),
});

// The leetcode collection as M14 left it: the M2 fields, migration 19's, 24's archived ref.
const FIELDS: Field[] = [
  { id: "number", name: "Number", type: "number" },
  {
    id: "difficulty",
    name: "Difficulty",
    type: "select",
    options: [option("easy"), option("medium"), option("hard", "Hard")],
  },
  { id: "topic", name: "Topic", type: "text" },
  {
    id: "status",
    name: "Status",
    type: "select",
    options: ["queued", "practicing", "review", "solved", "skipped"].map((v) => option(v)),
  },
  { id: "solved_at", name: "Solved", type: "date" },
  { id: "notes", name: "Notes", type: "text" },
  ...TRACKER_FIELDS,
  {
    id: "project",
    name: "Project",
    type: "ref",
    archived: true,
    config: { collection: "projects" },
  },
];

const problem = (id: string, data: Record<string, unknown>) => doc(id, "item", "leetcode", data);

function world(problems: Doc[], extra: Doc[] = []) {
  const docs = new Map<string, Doc>(
    [
      doc("leetcode", "collection", null, { name: "LeetCode", fields: FIELDS }),
      doc("p1", "item", "projects", { _title: "LeetCode", _deleted: true }),
      ...problems,
      ...extra,
    ].map((d) => [d.id, d]),
  );
  const get = (id: string) => docs.get(id);
  const items = (c: string) =>
    [...docs.values()].filter((d) => d.collection === c && d.data._deleted !== true);
  return { get, items, docs };
}

const body = (...problems: Doc[]) => leetcodeBody(problems, FIELDS, world([]).get);

// The editor's own parser, stock extensions only: what the note's checkboxes read as.
const markdown = new MarkdownManager({ extensions: [StarterKit, TaskList, TaskItem] });
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };
const parse = (md: string) => markdown.parse(md) as Node;
const textOf = (node: Node): string => node.text ?? (node.content ?? []).map(textOf).join("");

const PROBLEMS = [
  problem("a", {
    _title: "0013 Roman to Integer",
    number: 13,
    difficulty: "easy",
    topic: "foundations",
    status: "solved",
    _created: "2026-09-02T10:00:00.000Z",
    _body: "# Roman to Integer",
  }),
  problem("b", {
    _title: "0001 Two Sum",
    number: 1,
    difficulty: "easy",
    topic: "foundations",
    status: "queued",
    _created: "2026-09-01T10:00:00.000Z",
  }),
  problem("c", {
    _title: "0011 Container With Most Water",
    number: 11,
    difficulty: "medium",
    topic: "two pointers",
    status: "practicing",
    _created: "2026-09-01T12:00:00.000Z",
  }),
  problem("d", {
    _title: "0009 Palindrome Number",
    number: 9,
    difficulty: "easy",
    topic: " Foundations ",
    status: "solved",
    _created: "2026-09-02T10:00:00.000Z",
  }),
  problem("e", {
    _title: "Weekly contest recap",
    topic: "  ",
    status: "review",
    _created: "2026-09-01T11:00:00.000Z",
  }),
  problem("f", { _title: "0042 Trapping Rain Water", number: 42, difficulty: "hard" }),
];

const GROUPED = [
  "## Foundations",
  "",
  "- [ ] 1 · Two Sum · easy",
  "- [x] 9 · Palindrome Number · easy",
  "- [x] 13 · Roman to Integer · easy",
  "",
  "## Other",
  "",
  "- [ ] Weekly contest recap · review",
  "- [ ] 42 · Trapping Rain Water · Hard",
  "",
  "## Two pointers",
  "",
  "- [ ] 11 · Container With Most Water · medium · practicing",
].join("\n");

test("one note in topic LeetCode: a group per topic in order of first appearance, problems by creation then number", () => {
  const { get, items } = world(PROBLEMS);
  const docs = leetcodeToNotesMigration(get, items);
  // Sync refuses an id that isn't one.
  expect(isDocId(LEETCODE_NOTE)).toBe(true);
  expect(docs[0]).toEqual({
    id: LEETCODE_NOTE,
    kind: "item",
    collection: "notes",
    data: {
      _title: "LeetCode",
      _body: GROUPED,
      _created: "2026-09-01T10:00:00.000Z",
      folder: "LeetCode",
      source: "owner",
    },
  });
  // Every problem and the collection are marked deleted; nothing else is written.
  expect(docs.slice(1).map((d) => [d.id, d.kind, d.collection, d.data])).toEqual([
    ...PROBLEMS.map((p) => [p.id, "item", "leetcode", { _deleted: true }]),
    ["leetcode", "collection", undefined, { _deleted: true }],
  ]);
});

test("the body is a GFM task list per group: solved is checked, every other status is not", () => {
  const tree = parse(GROUPED);
  expect(tree.content?.map((n) => n.type)).toEqual([
    "heading",
    "taskList",
    "heading",
    "taskList",
    "heading",
    "taskList",
  ]);
  const items = (tree.content ?? []).flatMap((n) =>
    n.type === "taskList" ? (n.content ?? []) : [],
  );
  expect(items.map((i) => [i.attrs?.checked, textOf(i)])).toEqual([
    [false, "1 · Two Sum · easy"],
    [true, "9 · Palindrome Number · easy"],
    [true, "13 · Roman to Integer · easy"],
    [false, "Weekly contest recap · review"],
    [false, "42 · Trapping Rain Water · Hard"],
    [false, "11 · Container With Most Water · medium · practicing"],
  ]);
});

test("the name loses only a leading number equal to the problem's; no title is Untitled problem", () => {
  expect(
    body(
      problem("a", { _title: "0013 Roman to Integer", number: 13 }),
      problem("b", { _title: "1. Two Sum", number: 1 }),
      problem("c", { _title: "0042 Trapping Rain Water", number: 41 }),
      problem("d", { _title: "3Sum", number: 15 }),
      problem("e", { _title: "0070", number: 70 }),
      problem("f", { _title: "Weekly contest" }),
      problem("g", { number: 5 }),
    ),
  ).toBe(
    [
      "## Other",
      "",
      "- [ ] 1 · Two Sum",
      "- [ ] 5 · Untitled problem",
      "- [ ] 13 · Roman to Integer",
      "- [ ] 15 · 3Sum",
      "- [ ] 41 · 0042 Trapping Rain Water",
      "- [ ] 70 · 0070",
      "- [ ] Weekly contest",
    ].join("\n"),
  );
});

test("a safe URL links the name; any other stays as text; every other field follows by name, then unnamed keys sorted", () => {
  const line = body(
    problem("a", {
      _title: "0001 Two Sum",
      _order: 4,
      _addedBy: "claude",
      number: 1,
      difficulty: "easy",
      status: "solved",
      url: " https://leetcode.com/problems/two-sum/ ",
      solved_at: "2026-10-01",
      list: "blind75",
      pattern: "other",
      attempts: 2,
      minutes: 15,
      review_on: "2026-11-01",
      notes: "Hash map\n  O(n)",
      project: "p1",
      part: "x",
      legacy: false,
      empty: "",
      confidence: "high",
    }),
  );
  expect(line).toBe(
    "## Other\n\n- [x] 1 · [Two Sum](https://leetcode.com/problems/two-sum/) · easy · Solved: 2026-10-01 · Notes: Hash map O(n) · List: Blind 75 · Pattern: Other · Attempts: 2 · Minutes: 15 · Review on: 2026-11-01 · confidence: high",
  );
  expect(
    body(
      problem("b", { _title: "Sqrt(x)", number: 69, url: "javascript:alert(1)" }),
      problem("c", { _title: "Pow(x, n)", number: 50, url: "https://example.test/a (b)" }),
    ).split("\n"),
  ).toEqual([
    "## Other",
    "",
    "- [ ] 50 · [Pow(x, n)](https://example.test/a%20%28b%29)",
    "- [ ] 69 · Sqrt(x) · URL: javascript:alert(1)",
  ]);
});

test("characters Markdown would read are escaped, line breaks flattened: the line reads back as written", () => {
  const title = "Implement `strStr()` *fast* [[Wiki]] a_b <i> ~s~ x == y \\ :red[r]";
  const md = body(
    problem("a", {
      _title: title,
      number: 28,
      topic: "*strings*\nand [arrays]",
      notes: "**bold**\n_it_",
    }),
  );
  expect(md.split("\n")).toEqual([
    "## \\*strings\\* and \\[arrays\\]",
    "",
    "- [ ] 28 · Implement \\`strStr()\\` \\*fast\\* \\[\\[Wiki\\]\\] a\\_b \\<i> \\~s\\~ x \\=\\= y \\\\ :red\\[r\\] · Notes: \\*\\*bold\\*\\* \\_it\\_",
  ]);
  const [heading, list] = parse(md).content ?? [];
  expect(textOf(heading as Node)).toBe("*strings* and [arrays]");
  const item = list?.content?.[0] as Node;
  expect(textOf(item)).toBe(`28 · ${title} · Notes: **bold** _it_`);
  // Plain text throughout: no mark, no link, no code.
  expect(JSON.stringify(item)).not.toContain('"marks"');
  expect(inline("a = b, c === d")).toBe("a = b, c \\=\\=\\= d");
});

test("a problem's own text stays under its line, indented into the item, unless it only repeats the name", () => {
  const md = body(
    problem("a", { _title: "0013 Roman to Integer", number: 13, _body: "# Roman to Integer\n" }),
    problem("b", {
      _title: "0020 Valid Parentheses",
      number: 20,
      _body: "\n## 0020 valid  parentheses #",
    }),
    problem("c", {
      _title: "0021 Merge Two Sorted Lists",
      number: 21,
      _body: "\n# Approach\r\n\r\nTwo pointers.\n    code()\n",
    }),
    problem("d", { _title: "0022 Generate Parentheses", number: 22, _body: "Backtracking" }),
    problem("e", { _title: "0023 Merge k Sorted Lists", number: 23, _body: "# Heap" }),
  );
  expect(md.split("\n")).toEqual([
    "## Other",
    "",
    "- [ ] 13 · Roman to Integer",
    "- [ ] 20 · Valid Parentheses",
    "- [ ] 21 · Merge Two Sorted Lists",
    "",
    "  # Approach",
    "",
    "  Two pointers.",
    "      code()",
    "- [ ] 22 · Generate Parentheses",
    "",
    "  Backtracking",
    "- [ ] 23 · Merge k Sorted Lists",
    "",
    "  # Heap",
  ]);
  // The kept text is inside its item, and the list goes on after it.
  const [, list] = parse(md).content ?? [];
  expect(list?.type).toBe("taskList");
  const items = list?.content ?? [];
  expect(items.map((i) => i.content?.map((n) => n.type))).toEqual([
    ["paragraph"],
    ["paragraph"],
    ["paragraph", "heading", "paragraph"],
    ["paragraph", "paragraph"],
    ["paragraph", "heading"],
  ]);
});

test("a note already at note-leetcode is never written over; the problems are still retired; proposals are left alone", () => {
  const { get, items } = world(
    [problem("a", { _title: "0001 Two Sum", number: 1 })],
    [
      doc(LEETCODE_NOTE, "item", "notes", { _title: "Mine" }),
      doc("prop-1", "item", "proposals", { target: "a", status: "pending" }),
    ],
  );
  expect(leetcodeToNotesMigration(get, items).map((d) => [d.id, d.data])).toEqual([
    ["a", { _deleted: true }],
    ["leetcode", { _deleted: true }],
  ]);
});

test("no problems: only the collection is retired; no collection, or a retired one: nothing", () => {
  const empty = world([problem("gone", { _title: "Gone", _deleted: true })]);
  expect(leetcodeToNotesMigration(empty.get, empty.items)).toEqual([
    { id: "leetcode", kind: "collection", data: { _deleted: true } },
  ]);
  expect(
    leetcodeToNotesMigration(
      () => undefined,
      () => [],
    ),
  ).toEqual([]);
  const retired = world([problem("a", { _title: "A" })]);
  retired.docs.set("leetcode", doc("leetcode", "collection", null, { _deleted: true }));
  expect(leetcodeToNotesMigration(retired.get, retired.items)).toEqual([]);
});

test("running it on its own output writes nothing", () => {
  const w = world(PROBLEMS);
  for (const d of leetcodeToNotesMigration(w.get, w.items)) {
    const before = w.docs.get(d.id);
    w.docs.set(d.id, doc(d.id, d.kind, d.collection ?? null, { ...before?.data, ...d.data }));
  }
  expect(w.items("notes").map((n) => n.id)).toEqual([LEETCODE_NOTE]);
  expect(w.items("leetcode")).toEqual([]);
  expect(leetcodeToNotesMigration(w.get, w.items)).toEqual([]);
});
