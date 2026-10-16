import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatStamp } from "../shared/hlc.ts";
import { seedDocs } from "../shared/seed.ts";
import { openDb } from "./db.ts";
import { createStore } from "./store.ts";

describe("seedIfEmpty", () => {
  test("seeds the collections once, logged as the seed actor", () => {
    const store = createStore(openDb(":memory:"));
    expect(store.seedIfEmpty(seedDocs(), 1)).toBe(true);
    const seeded = store.changesSince(0, 100).map((r) => r.doc.id);
    expect(seeded.sort()).toEqual(
      seedDocs()
        .map((d) => d.id)
        .sort(),
    );
    expect(store.changeLog().every((row) => row.actor === "seed")).toBe(true);

    const log = store.changeLog().length;
    expect(store.seedIfEmpty(seedDocs(), 2)).toBe(false);
    expect(store.changeLog().length).toBe(log);
  });

  test("any user edit wins over a seeded value", () => {
    const store = createStore(openDb(":memory:"));
    store.seedIfEmpty(seedDocs(), 1);
    const money = store.get("money");
    if (!money) throw new Error("money not seeded");

    store.applyChanges(
      [{ ...money, data: { name: "Spending" }, stamps: { name: formatStamp(1, 0, "dev-a") } }],
      "user:dev-a",
      2,
    );
    expect(store.get("money")?.data.name).toBe("Spending");
    expect(store.get("money")?.data.fields).toEqual(money.data.fields);
  });
});

describe("change log", () => {
  test("records each changed key's previous value and stamp for undo", () => {
    const store = createStore(openDb(":memory:"));
    const edit = (status: string, ms: number) => ({
      id: "t1",
      kind: "item" as const,
      collection: "tasks",
      data: { status },
      stamps: { status: formatStamp(ms, 0, "dev-a") },
      actor: "",
    });
    store.applyChanges([edit("todo", 10)], "user:dev-a", 1);
    store.applyChanges([edit("done", 20)], "user:dev-a", 2);

    const [first, second] = store.changeLog();
    expect(first?.before).toEqual({ status: null });
    expect(second?.before).toEqual({
      status: { value: "todo", stamp: formatStamp(10, 0, "dev-a") },
    });
  });
});

describe("openDb", () => {
  test("persists to a file and reopens", () => {
    const dir = mkdtempSync(join(tmpdir(), "cave-"));
    try {
      const path = join(dir, "nested", "cave.db");
      const first = openDb(path);
      createStore(first).seedIfEmpty(seedDocs(), 1);
      first.close();

      const second = openDb(path);
      expect(createStore(second).get("tasks")?.kind).toBe("collection");
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("hasItems ignores everything the seed wrote, the flow drafts included", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  expect(store.hasItems()).toBe(false);
  store.applyChanges(
    [
      {
        id: "t1",
        kind: "item",
        collection: "tasks",
        data: { _title: "x" },
        stamps: { _title: formatStamp(2, 0, "dev-a") },
        actor: "",
      },
    ],
    "user:dev-a",
    2,
  );
  expect(store.hasItems()).toBe(true);
});

test("each change records the stamp its keys got and returns its seq", () => {
  const store = createStore(openDb(":memory:"));
  const stamp = formatStamp(5, 0, "dev-a");
  const applied = store.applyChanges(
    [
      {
        id: "t1",
        kind: "item",
        collection: "tasks",
        data: { _title: "x", status: "todo" },
        stamps: { _title: stamp, status: stamp },
        actor: "",
      },
    ],
    "user:dev-a",
    5,
  );
  expect(applied).toEqual([{ id: "t1", seq: 1 }]);
  const [change] = store.changesBySeq([1, 99]);
  expect(change?.after).toEqual({ _title: stamp, status: stamp });
  expect(change?.before).toEqual({ _title: null, status: null });
});
