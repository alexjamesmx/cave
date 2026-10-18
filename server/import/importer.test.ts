import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fieldsOf } from "../../shared/fields.ts";
import { seedDocs } from "../../shared/seed.ts";
import { openDb } from "../db.ts";
import { createStore, type Store } from "../store.ts";
import { formatReport, importId, importIfEmpty, importVault, newNotes } from "./importer.ts";

const NOW = 1_791_800_000_000;
let root: string;
let store: Store;

const VAULT: Record<string, string> = {
  "Money/Ledger/2026/2026-10-01 Tacos.md":
    "---\ndate: 2026-10-01T13:05:00\namount: 250\ndirection: expense\ncategory: food\nbucket: x\naccount: bank\n---\n",
  "Money/Ledger/2026/2026-10-02 Gift.md":
    "---\ndate: 2026-10-02\namount: 900\ndirection: expense\ncategory: pets\n---\n",
  "Money/Ledger/2025/2025-08-02 Odd.md":
    "---\ndate: 2025-08-02\namount: 12\ndirection: sideways\ncategory:\n---\n",
  "Money/Ledger/.trash/2026-01-01 Gone.md": "---\namount: 1\n---\n",
  "Money/Wealth/Stocks.md": "---\ntype: stocks\nvalue: 1000.5\nupdated: 2026-09-13\n---\nHistory",
  "Money/Wealth/Archive/Old.md": "---\ntype: stocks\n---\n",
  "Tasks/Pay rent.md":
    "---\nstatus: todo\npriority: high\ndue:\ncreated: 2026-10-01T09:30\n---\n# Pay rent\n",
  "Tasks/Find item.md":
    "---\nstatus: done\ncompleted: 2026-10-09T14:45:12\ncancelled: 2026-10-10\n---\n# Find item\n",
  "Journal/2026/2026-01-17.md": "---\ndate: 2026-01-17\ngym: true\nstatus: montag\n---\nDiary",
  "Journal/Templates/Day.md": "---\ndate: 2026-01-01\n---\n",
  "Projects/LeetCode/0001 Two Sum.md":
    "---\nleetcode_id: 1\ndifficulty: easy\nstatus: |-\n  \n  queued\nconfidence: 5\n---\n",
  "Projects/LeetCode.md": "---\nstatus: active\narea: learning\n---\n",
  "System/categories.json": JSON.stringify([
    { name: "food", icon: "🍔" },
    { name: "pets", icon: "🐶" },
  ]),
  "System/money.md": "---\namount: 5\n---\n",
  ".obsidian/workspace.md": "---\na: 1\n---\n",
  ".backup/old/Note.md": "Kept by Obsidian Sync",
  "System/templates/Daily.md": "Template",
  "Home.md": "---\ncreated: 2026-01-02T08:00\ntags: [home]\n---\nWelcome. See [[Plan]].",
  "Notes/Ideas/Plan.md": "---\nmood: calm\nlinks: 3\n---\nThe plan.",
  "Notes/Empty.md": "---\ntags: []\n---\n",
  "✅ ToDos/Items/Old.md": "---\nstatus: todo\n---\n",
  "Tasks/Bad yaml.md": "---\nstatus: [todo\n---\n",
};

function snapshot(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const full = join(e.parentPath, e.name);
      const s = statSync(full);
      return `${full}|${s.size}|${s.mtimeMs}`;
    })
    .sort();
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cave-vault-"));
  for (const [path, text] of Object.entries(VAULT)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
  store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 0);
});

test("imports each source into its collection and skips everything else", async () => {
  const report = await importVault({ root, store, now: NOW });
  expect(report.added).toEqual({
    money: 3,
    wealth: 1,
    tasks: 2,
    journal: 1,
    leetcode: 1,
    projects: 1,
    // Every other Markdown file, outside dot folders, templates and empty ones.
    notes: 6,
  });
  expect(report.ledgerFiles).toBe(3);
  expect(report.ledgerDocs).toBe(3);

  const tacos = store.get(importId("Money/Ledger/2026/2026-10-01 Tacos.md"));
  expect(tacos?.collection).toBe("money");
  expect(tacos?.actor).toBe("import");
  expect(tacos?.data._title).toBe("Tacos");
  expect(tacos?.data.amount).toBe(250);
  expect(tacos?.data).not.toHaveProperty("bucket");
  expect(store.get(importId("Tasks/Pay rent.md"))?.data._created).toBe("2026-10-01T15:30:00.000Z");
  expect(store.get(importId("Projects/LeetCode/0001 Two Sum.md"))?.data.status).toBe("queued");
});

test("free notes: title from the file, folder from its directory, extra frontmatter kept in the body", async () => {
  const report = await importVault({ root, store, now: NOW });
  const notes = store
    .itemsOf("notes")
    .map((n) => [n.data.folder, n.data._title])
    .sort();
  expect(notes).toEqual([
    ["", "Home"],
    ["Journal/Templates", "Day"],
    ["Money/Wealth/Archive", "Old"],
    ["Notes/Ideas", "Plan"],
    ["System", "money"],
    ["\u2705 ToDos/Items", "Old"],
  ]);
  expect(store.get(importId("Home.md"))?.data).toMatchObject({
    _body: "Welcome. See [[Plan]].",
    source: "import",
    _created: "2026-01-02T14:00:00.000Z",
  });
  expect(store.get(importId("Notes/Ideas/Plan.md"))?.data._body).toBe(
    "- mood: calm\n- links: 3\n\nThe plan.",
  );
  expect(report.notesWithExtraKeys).toContain("Notes/Ideas/Plan.md");
  expect(report.notesWithExtraKeys).not.toContain("Home.md");
  expect(report.emptyNotes).toBe(1);
});

test("an invalid value is left out and reported; the rest of the note is kept", async () => {
  const report = await importVault({ root, store, now: NOW });
  const odd = store.get(importId("Money/Ledger/2025/2025-08-02 Odd.md"));
  expect(odd?.data).not.toHaveProperty("direction");
  expect(odd?.data).not.toHaveProperty("category");
  expect(odd?.data.amount).toBe(12);
  expect(report.problems.some((p) => p.includes("Odd.md: direction"))).toBe(true);
});

test("a note whose YAML does not parse is reported, not imported", async () => {
  const report = await importVault({ root, store, now: NOW });
  expect(report.problems.some((p) => p.startsWith("Tasks/Bad yaml.md:"))).toBe(true);
  expect(store.get(importId("Tasks/Bad yaml.md"))).toBeUndefined();
});

test("category names from categories.json the seed lacks become options, emoji ignored", async () => {
  const report = await importVault({ root, store, now: NOW });
  expect(report.categoriesAdded).toEqual(["pets"]);
  const category = fieldsOf(store.get("money")).find((f) => f.id === "category");
  expect(category?.options?.at(-1)).toEqual({ value: "pets", icon: "tag", color: "#8C93A0" });
  expect(store.get(importId("Money/Ledger/2026/2026-10-02 Gift.md"))?.data.category).toBe("pets");
});

test("keys that are not fields are kept and listed", async () => {
  const report = await importVault({ root, store, now: NOW });
  expect(report.extraKeys).toEqual({ journal: ["status"], leetcode: ["confidence"] });
  expect(formatReport(report)).toContain("leetcode: confidence");
});

test("add-only: a second run adds nothing and keeps owner edits", async () => {
  await importVault({ root, store, now: NOW });
  const id = importId("Tasks/Pay rent.md");
  const edited = store.get(id);
  if (!edited) throw new Error("missing");
  store.applyChanges(
    [{ ...edited, data: { status: "done" }, stamps: { status: `${NOW + 1}:0000:laptop` } }],
    "user:laptop",
    NOW + 1,
  );
  const logLength = store.changeLog().length;

  const again = await importVault({ root, store, now: NOW + 2 });
  expect(again.added).toEqual({});
  expect(again.skipped).toBe(15);
  expect(store.get(id)?.data.status).toBe("done");
  expect(store.changeLog()).toHaveLength(logLength);
});

test("the vault is not modified", async () => {
  const before = snapshot(root);
  await importVault({ root, store, now: NOW });
  expect(snapshot(root)).toEqual(before);
});

test("importIfEmpty runs only with a vault path and an empty database", async () => {
  expect(await importIfEmpty(store, undefined, NOW)).toBeUndefined();
  expect((await importIfEmpty(store, root, NOW))?.added.money).toBe(3);
  expect(await importIfEmpty(store, root, NOW)).toBeUndefined();
});

test("task completed and cancelled keep their time", async () => {
  const report = await importVault({ root, store, now: NOW });
  expect(report.problems.filter((p) => p.startsWith("Tasks/Find item.md"))).toEqual([]);
  expect(store.get(importId("Tasks/Find item.md"))?.data).toMatchObject({
    completed: "2026-10-09T14:45:12",
    cancelled: "2026-10-10",
  });
});

test("a dry run reports the new notes and writes nothing; the real import adds exactly those", async () => {
  const before = store.changeLog().length;
  const dry = await importVault({ root, store, now: NOW, dryRun: true });
  expect(store.changeLog().length).toBe(before);
  expect(store.hasItems()).toBe(false);
  const real = await importVault({ root, store, now: NOW });
  expect(newNotes(dry)).toBe(newNotes(real));
  expect(newNotes(dry)).toBeGreaterThan(0);
  const again = await importVault({ root, store, now: NOW + 1, dryRun: true });
  expect(newNotes(again)).toBe(0);
});
