import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, uptime } from "node:os";
import { join } from "node:path";
import { fieldsOf, validateFields } from "../shared/fields.ts";
import { seedDocs } from "../shared/seed.ts";
import { openDb } from "./db.ts";
import { lockPathOf } from "./lock.ts";
import { parseSeedArgs, SAMPLE_ACTOR, seedDatabase, seedDay, seedRefusal } from "./sample-db.ts";
import { createStore } from "./store.ts";

const dirs: string[] = [];
const tempDb = () => {
  const dir = mkdtempSync(join(tmpdir(), "cave-seed-"));
  dirs.push(dir);
  return join(dir, "seed.db");
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = Date.parse("2026-10-16T18:30:00Z");
const env = { CAVE_DB_PATH: "data/cave.db" };

function docsOf(path: string) {
  const db = openDb(path);
  try {
    return createStore(db).allDocs();
  } finally {
    db.close();
  }
}

function seeded(now = NOW) {
  const path = tempDb();
  const result = seedDatabase({ db: path, reset: false }, env, now);
  if (!result.ok) throw new Error(result.error);
  return { path, docs: docsOf(path) };
}

describe("seedDatabase", () => {
  test("every collection of a fresh seed gets at least one live item", () => {
    const { docs } = seeded();
    const collections = seedDocs().filter((d) => d.kind === "collection");
    expect(collections.length).toBeGreaterThan(10);
    for (const c of collections) {
      const items = docs.filter(
        (d) => d.kind === "item" && d.collection === c.id && d.data._deleted !== true,
      );
      expect({ collection: c.id, items: items.length > 0 }).toEqual({
        collection: c.id,
        items: true,
      });
    }
  });

  test("every item passes the device-write validation, refs and select options included", () => {
    const { docs } = seeded();
    const byId = new Map(docs.map((d) => [d.id, d]));
    for (const doc of docs.filter((d) => d.kind === "item")) {
      const errors = validateFields(fieldsOf(byId.get(doc.collection ?? "")), doc.data, {
        refTarget: (id) => byId.get(id),
      });
      expect({ id: doc.id, errors }).toEqual({ id: doc.id, errors: [] });
    }
  });

  test("two runs on the same day write the same docs, whatever the hour", () => {
    const later = NOW + 3 * 3_600_000;
    expect(seedDay(later).today).toBe(seedDay(NOW).today);
    expect(seeded(later).docs).toEqual(seeded(NOW).docs);
  });

  test("dates follow today: this month has money and Payments has something due soon", () => {
    const { docs } = seeded();
    const { today } = seedDay(NOW);
    const month = today.slice(0, 7);
    const money = docs.filter((d) => d.collection === "money");
    expect(money.some((d) => String(d.data.date).startsWith(month))).toBe(true);
    expect(money.every((d) => String(d.data.date).slice(0, 10) <= today)).toBe(true);
    expect(new Set(money.map((d) => String(d.data.date).slice(0, 7))).size).toBe(12);
    const dues = docs
      .filter((d) => d.collection === "payments" && d.data.active === true)
      .map((d) => String(d.data.due).slice(0, 10));
    expect(dues.some((due) => due >= today && due <= "2026-10-31")).toBe(true);
  });

  test("sample items are the owner's records, so vault import never runs over them", () => {
    const { path, docs } = seeded();
    expect(docs.filter((d) => d.id.startsWith("s-")).every((d) => d.actor === SAMPLE_ACTOR)).toBe(
      true,
    );
    const db = openDb(path);
    try {
      expect(createStore(db).hasItems()).toBe(true);
    } finally {
      db.close();
    }
  });

  test("a folder that doesn't exist yet is created, as data/ in a fresh checkout", () => {
    const path = join(tempDb(), "..", "new", "seed.db");
    expect(seedDatabase({ db: path, reset: false }, env, NOW).ok).toBe(true);
  });

  test("an existing database is kept unless --reset, which replaces it", () => {
    const { path } = seeded();
    const again = seedDatabase({ db: path, reset: false }, env, NOW);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("--reset");
    const reset = seedDatabase({ db: path, reset: true }, env, NOW);
    expect(reset.ok).toBe(true);
  });

  test("a database a running server holds is refused, even with --reset", () => {
    const { path } = seeded();
    // The lock format the server writes: this test process stands in for a live server.
    const bootAt = Date.now() - uptime() * 1000;
    writeFileSync(lockPathOf(path), JSON.stringify({ pid: process.ppid, bootAt }));
    const result = seedDatabase({ db: path, reset: true }, env, NOW);
    expect(result.ok).toBe(false);
  });
});

describe("seedRefusal", () => {
  test("production, /var/lib and the live database are refused", () => {
    expect(seedRefusal(tempDb(), false, { CAVE_ENV: "production" })).toContain("production");
    expect(seedRefusal("/var/lib/cave/cave.db", true, {})).toContain("/var/lib");
    expect(seedRefusal("data/cave.db", true, {})).toContain("CAVE_DB_PATH");
    expect(seedRefusal("data/dev.db", true, { CAVE_DB_PATH: "data/dev.db" })).toContain(
      "CAVE_DB_PATH",
    );
  });

  test("an empty file or a new path is fine", () => {
    const path = tempDb();
    expect(seedRefusal(path, false, env)).toBeUndefined();
    writeFileSync(path, "");
    expect(seedRefusal(path, false, env)).toBeUndefined();
  });
});

test("parseSeedArgs reads --db and --reset and refuses anything else", () => {
  expect(parseSeedArgs([])).toEqual({ ok: true, value: { db: "data/seed.db", reset: false } });
  expect(parseSeedArgs(["--db", "x.db", "--reset"])).toEqual({
    ok: true,
    value: { db: "x.db", reset: true },
  });
  expect(parseSeedArgs(["--db"]).ok).toBe(false);
  expect(parseSeedArgs(["--force"]).ok).toBe(false);
});
