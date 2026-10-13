import { describe, expect, test } from "bun:test";
import { formatStamp, SEED_STAMP } from "./hlc.ts";
import { mergeDoc } from "./merge.ts";
import type { Doc } from "./types.ts";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = ["_title", "_body", "_deleted", "amount", "status", "tags"];
const DEVICES = ["a", "b", "c"];
const VALUES: unknown[] = [null, 0, 12.5, "x", "y", true, false, ["p", "q"], { n: 1 }, { n: 2 }];

function randomDoc(rand: () => number): Doc {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const data: Record<string, unknown> = {};
  const stamps: Record<string, string> = {};
  for (const key of KEYS) {
    if (rand() < 0.4) continue;
    data[key] = pick(VALUES);
    // Tiny ranges force equal stamps carrying different values, which exercises the tie-break.
    stamps[key] = formatStamp(Math.floor(rand() * 4), Math.floor(rand() * 2), pick(DEVICES));
  }
  return { id: "doc1", kind: "item", collection: "tasks", data, stamps, actor: "user:x" };
}

const fields = (d: Doc) => ({ data: d.data, stamps: d.stamps });
const m = (a: Doc, b: Doc) => mergeDoc(a, b).doc;

describe("mergeDoc properties (seeded random)", () => {
  const ITERATIONS = 400;
  const rand = mulberry32(0xc0ffee);

  test("commutative, associative and idempotent", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const a = randomDoc(rand);
      const b = randomDoc(rand);
      const c = randomDoc(rand);

      expect(fields(m(a, b))).toEqual(fields(m(b, a)));
      expect(fields(m(m(a, b), c))).toEqual(fields(m(a, m(b, c))));
      expect(fields(m(a, a))).toEqual(fields(a));
      expect(fields(m(m(a, b), b))).toEqual(fields(m(a, b)));
    }
  });

  test("re-merging the result reports no changed keys", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const merged = m(randomDoc(rand), randomDoc(rand));
      expect(mergeDoc(merged, merged).changed).toEqual([]);
    }
  });
});

describe("mergeDoc", () => {
  const base: Doc = {
    id: "t1",
    kind: "item",
    collection: "tasks",
    data: { _title: "old", status: "todo" },
    stamps: { _title: formatStamp(10, 0, "a"), status: formatStamp(10, 0, "a") },
    actor: "user:a",
  };

  test("a missing local doc is created and every key counts as changed", () => {
    const { doc, changed } = mergeDoc(undefined, base);
    expect(doc).toEqual(base);
    expect(changed.sort()).toEqual(["_title", "status"]);
  });

  test("per-key last writer wins and only winning keys are reported", () => {
    const incoming: Doc = {
      ...base,
      data: { _title: "new", status: "stale" },
      stamps: { _title: formatStamp(20, 0, "b"), status: formatStamp(5, 0, "b") },
      actor: "user:b",
    };
    const { doc, changed } = mergeDoc(base, incoming);
    expect(doc.data).toEqual({ _title: "new", status: "todo" });
    expect(changed).toEqual(["_title"]);
    expect(doc.actor).toBe("user:b");
  });

  test("an incoming doc that changes nothing keeps the local actor", () => {
    const { doc, changed } = mergeDoc(base, { ...base, actor: "agent:x" });
    expect(changed).toEqual([]);
    expect(doc.actor).toBe("user:a");
  });

  test("id, kind and collection never change", () => {
    const incoming: Doc = { ...base, kind: "setting", collection: "money" };
    const { doc } = mergeDoc(base, incoming);
    expect(doc.kind).toBe("item");
    expect(doc.collection).toBe("tasks");
  });

  test("_deleted is its own key: a later edit to another field does not undelete", () => {
    const deleted = mergeDoc(base, {
      ...base,
      data: { _deleted: true },
      stamps: { _deleted: formatStamp(30, 0, "a") },
    }).doc;
    const editedLater = mergeDoc(deleted, {
      ...base,
      data: { _title: "edited after delete" },
      stamps: { _title: formatStamp(40, 0, "b") },
    }).doc;
    expect(editedLater.data._deleted).toBe(true);
    expect(editedLater.data._title).toBe("edited after delete");

    const restored = mergeDoc(editedLater, {
      ...base,
      data: { _deleted: false },
      stamps: { _deleted: formatStamp(50, 0, "b") },
    }).doc;
    expect(restored.data._deleted).toBe(false);
  });

  test("seed values (stamp time 0) lose to any edit", () => {
    const seeded: Doc = { ...base, stamps: { _title: SEED_STAMP, status: SEED_STAMP } };
    const edit: Doc = {
      ...base,
      data: { status: "done" },
      stamps: { status: formatStamp(1, 0, "a") },
    };
    expect(mergeDoc(seeded, edit).doc.data.status).toBe("done");
    expect(mergeDoc(edit, seeded).doc.data.status).toBe("done");
  });

  test("does not mutate its inputs", () => {
    const local = structuredClone(base);
    const incoming: Doc = {
      ...base,
      data: { _title: "z" },
      stamps: { _title: formatStamp(99, 0, "b") },
    };
    const snapshot = structuredClone(incoming);
    mergeDoc(local, incoming);
    expect(local).toEqual(base);
    expect(incoming).toEqual(snapshot);
  });
});
