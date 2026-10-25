import { expect, test } from "bun:test";
import { RADAR, radarMigration, sameUrl } from "./radar.ts";
import type { Doc } from "./types.ts";

test("one key per address: case, a trailing slash and a fragment don't make a new one", () => {
  expect(sameUrl("https://WWW.A.dev/post/#x")).toBe(sameUrl("https://www.a.dev/post"));
  expect(sameUrl("https://a.dev/post?id=1")).not.toBe(sameUrl("https://a.dev/post?id=2"));
  expect(sameUrl("not a url ")).toBe("not a url");
});

test("migration 15 adds the collection only where missing", () => {
  expect(radarMigration(() => undefined).map((d) => d.id)).toEqual([RADAR]);
  const present = (id: string): Doc => ({
    id,
    kind: "collection",
    collection: null,
    data: {},
    stamps: {},
    actor: "test",
  });
  expect(radarMigration(present)).toEqual([]);
});
