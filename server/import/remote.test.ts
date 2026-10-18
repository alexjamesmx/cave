import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { seedDocs } from "../../shared/seed.ts";
import { serveCave } from "../app.ts";
import { openDb } from "../db.ts";
import { migrateSeed } from "../seed-migrations.ts";
import { createStore, type Store } from "../store.ts";
import { importId } from "./importer.ts";
import { IMPORT_DEVICE, importRemote } from "./remote.ts";

// Built at run time, like every token in the tests.
const TOKEN = ["remote", "import", "test", "token", "0123456789"].join("-");
let root: string;
let store: Store;
let server: ReturnType<typeof serveCave>;

const VAULT: Record<string, string> = {
  "Home.md": "Welcome. See [[Plan]].",
  "Notes/Plan.md": "The plan.",
  "Inbox/Already.md": "Imported before.",
  "Tasks/Pay rent.md": "---\nstatus: todo\n---\n# Pay rent\n",
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cave-vault-"));
  for (const [path, text] of Object.entries(VAULT)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  migrateSeed(store, Date.now());
  // One note the hosted server already has: the import must not send it again.
  const id = importId("Inbox/Already.md");
  store.applyChanges(
    [
      {
        id,
        kind: "item",
        collection: "notes",
        data: { _title: "Edited on the phone" },
        stamps: { _title: `${Date.now()}:0000:phone` },
        actor: "user:phone",
      },
    ],
    "user:phone",
    Date.now(),
  );
  server = serveCave({ hostname: "127.0.0.1", port: 0, store, token: TOKEN, now: Date.now });
});

afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

const remote = () => ({ url: server.url.href, token: TOKEN });

test("a dry run against the hosted server reports what it would add and writes nothing", async () => {
  const before = store.docCount();
  const { report, pushed } = await importRemote(root, remote(), true);
  expect(report.added).toEqual({ notes: 2, tasks: 1 });
  expect(report.skipped).toBe(1);
  expect(pushed).toBe(0);
  expect(store.docCount()).toBe(before);
});

test("the import pushes only new docs, stamped at time 0, and leaves the server's own as they are", async () => {
  const { pushed, refused } = await importRemote(root, remote(), false);
  expect([pushed, refused]).toEqual([3, 0]);
  const home = store.get(importId("Home.md"));
  expect(home).toMatchObject({
    collection: "notes",
    data: { _title: "Home", folder: "", source: "import" },
  });
  expect(Object.values(home?.stamps ?? {}).every((s) => s.startsWith("0000000000000:"))).toBe(true);
  expect(store.changesFor(importId("Home.md"), 1)[0]?.actor).toBe(`user:${IMPORT_DEVICE}`);
  expect(store.get(importId("Inbox/Already.md"))?.data._title).toBe("Edited on the phone");

  // Run again: nothing new.
  const again = await importRemote(root, remote(), false);
  expect([again.pushed, again.report.skipped]).toEqual([0, 4]);
});
