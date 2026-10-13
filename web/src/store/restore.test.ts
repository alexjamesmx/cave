import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { takeBackup } from "../../../server/backup.ts";
import { openDb } from "../../../server/db.ts";
import { restoreBackup } from "../../../server/restore.ts";
import { createStore, type Store } from "../../../server/store.ts";
import { createSyncHandler } from "../../../server/sync.ts";
import { seedDocs } from "../../../shared/seed.ts";
import { openLocalDb } from "./db.ts";
import { LocalStore } from "./local-store.ts";
import { readSyncResponse, syncOnce } from "./sync.ts";

let dir: string;
let dbPath: string;
let db: Database;
let server: Store;
let now: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cave-two-devices-"));
  dbPath = join(dir, "cave.db");
  db = openDb(dbPath);
  server = createStore(db);
  server.seedIfEmpty(seedDocs(), 1);
  now = 1_791_900_000_000;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function device(name: string) {
  const local = await LocalStore.open({
    db: openLocalDb(`cave-${name}-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange }),
    deviceId: name,
    now: () => now,
  });
  // Reads `server` on every call, so the devices reach the restored database too.
  const sync = () =>
    syncOnce(local, async (req) => {
      const handle = createSyncHandler({ store: server, token: undefined, now: () => now });
      const res = await handle(
        new Request("http://cave.test/api/sync", { method: "POST", body: JSON.stringify(req) }),
      );
      return readSyncResponse(res, local);
    });
  await sync();
  return { local, sync };
}

const task = (id: string) => ({ id, kind: "item" as const, collection: "tasks" });

test("after a restore, one sync each brings the edits made since the backup back", async () => {
  const laptop = await device("laptop");
  const phone = await device("phone");
  await laptop.local.write(task("t1"), { _title: "Ship M4", status: "todo" });
  await laptop.sync();
  await phone.sync();

  const backup = takeBackup(db, join(dir, "backups"), now);
  if (!backup.ok) throw new Error(backup.error);

  now += 60_000;
  await laptop.local.write(task("t1"), { status: "done" });
  await laptop.sync();
  await phone.local.write(task("t2"), { _title: "Write the log" });
  await phone.sync();
  await laptop.sync();

  db.close();
  const restored = restoreBackup(backup.file, dbPath, now);
  if (!restored.ok) throw new Error(restored.error);
  db = openDb(dbPath);
  server = createStore(db);
  expect(server.get("t1")?.data.status).toBe("todo");
  expect(server.get("t2")).toBeUndefined();

  await laptop.sync();
  await phone.sync();

  for (const copy of [server.get.bind(server), laptop.local.get.bind(laptop.local)]) {
    expect((await copy("t1"))?.data.status).toBe("done");
    expect((await copy("t2"))?.data._title).toBe("Write the log");
  }
  expect((await phone.local.get("t1"))?.data.status).toBe("done");
  expect((await phone.local.get("t2"))?.data._title).toBe("Write the log");
  expect(await laptop.local.cursor()).toBe(await phone.local.cursor());
  expect(await laptop.local.db.outbox.count()).toBe(0);
});

test("the first sync only records the server's db id", async () => {
  const laptop = await device("laptop");
  expect(await laptop.local.db.meta.get("dbId")).toEqual({ key: "dbId", value: server.dbId() });
  expect(await laptop.local.adoptServer(server.dbId())).toBe(false);
  expect(await laptop.local.db.outbox.count()).toBe(0);
});
