import { expect, test } from "bun:test";
import { parseNote } from "./frontmatter.ts";
import { mapNote } from "./mappers.ts";

const FILE_MS = Date.UTC(2026, 9, 1, 12);
const ctx = (path: string) => ({ path, createdMs: FILE_MS, timeZone: "America/Mexico_City" });

test("ledger: frontmatter as is, bucket dropped, title without the date prefix", () => {
  const note = parseNote(
    "---\ndate: 2026-10-01T13:05:00\namount: 250\ndirection: expense\ncategory: food\nbucket: needs\naccount: bank\n---\n",
  );
  const { data, problems } = mapNote("ledger", note, ctx("Money/Ledger/2026/2026-10-01 Tacos.md"));
  expect(data).toEqual({
    date: "2026-10-01T13:05:00",
    amount: 250,
    direction: "expense",
    category: "food",
    account: "bank",
    _title: "Tacos",
    _created: new Date(FILE_MS).toISOString(),
  });
  expect(problems).toEqual([]);
});

test("an empty category stays out of the data, never guessed", () => {
  const note = parseNote("---\namount: 10\ncategory:\ndetail: ''\n---\n");
  const { data } = mapNote("ledger", note, ctx("Money/Ledger/2026/2026-10-02 X.md"));
  expect("category" in data).toBe(false);
  expect("detail" in data).toBe(false);
});

test("tasks: the # heading becomes the title, created is local time in the settings zone", () => {
  const note = parseNote(
    "---\nstatus: doing\ncreated: 2026-10-01T09:30\n---\n# Pay rent\n\nBefore the 5th.\n",
  );
  const { data } = mapNote("tasks", note, ctx("Tasks/pay-rent.md"));
  expect(data._title).toBe("Pay rent");
  expect(data._body).toBe("Before the 5th.");
  expect(data._created).toBe("2026-10-01T15:30:00.000Z");
  expect("created" in data).toBe(false);
});

test("tasks without a heading use the file name", () => {
  const { data } = mapNote(
    "tasks",
    parseNote("---\nstatus: todo\n---\nNotes"),
    ctx("Tasks/Call bank.md"),
  );
  expect(data._title).toBe("Call bank");
  expect(data._body).toBe("Notes");
});

test("an unreadable created falls back to the file time and is reported", () => {
  const { data, problems } = mapNote(
    "tasks",
    parseNote("---\ncreated: soon\n---\n"),
    ctx("Tasks/a.md"),
  );
  expect(data._created).toBe(new Date(FILE_MS).toISOString());
  expect(problems).toHaveLength(1);
});

test("leetcode: leetcode_id becomes number and status is trimmed; extras are kept", () => {
  const note = parseNote(
    "---\nleetcode_id: 1\ndifficulty: easy\nstatus: |-\n  \n  queued \nconfidence: 5\n---\n",
  );
  const { data } = mapNote("leetcode", note, ctx("Projects/LeetCode/0001 Two Sum.md"));
  expect(data).toMatchObject({ number: 1, status: "queued", difficulty: "easy", confidence: 5 });
  expect("leetcode_id" in data).toBe(false);
  expect(data._title).toBe("0001 Two Sum");
});

test("journal: habit booleans and extras as is, body to _body", () => {
  const note = parseNote(
    "---\ndate: 2026-01-17\ngym: true\nreading: false\nstatus: montag\n---\nDear diary",
  );
  const { data } = mapNote("journal", note, ctx("Journal/2026/2026-01-17.md"));
  expect(data).toMatchObject({
    date: "2026-01-17",
    gym: true,
    reading: false,
    status: "montag",
    _title: "2026-01-17",
    _body: "Dear diary",
  });
});
