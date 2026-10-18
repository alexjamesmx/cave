import { expect, test } from "bun:test";
import {
  DEFAULT_INTERESTS,
  domainOf,
  formatInterests,
  interestsOf,
  matchedInterests,
  parseInterests,
  RADAR,
  radarMigration,
  radarTabs,
  sameUrl,
  saveWrites,
} from "./radar.ts";
import type { Doc } from "./types.ts";

const item = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "item",
  collection: RADAR,
  data: { status: "new", ...data },
  stamps: {},
  actor: "test",
});

test("domains and one key per address", () => {
  expect(domainOf("https://www.theverge.com/a")).toBe("theverge.com");
  expect(domainOf("nope")).toBe("");
  expect(sameUrl("https://WWW.A.dev/post/#x")).toBe(sameUrl("https://www.a.dev/post"));
  expect(sameUrl("https://a.dev/post?id=1")).not.toBe(sameUrl("https://a.dev/post?id=2"));
});

test("interests match listed names or whole-word keywords in the title or domain", () => {
  const listed = item("1", { _title: "Something", interests: "crypto, Gaming" });
  expect(matchedInterests(listed, DEFAULT_INTERESTS)).toEqual(["Gaming", "Crypto"]);
  const keyword = item("2", { _title: "New LLM benchmark", url: "https://x.dev" });
  expect(matchedInterests(keyword, DEFAULT_INTERESTS)).toEqual(["AI"]);
  // "ai" inside "maintain" is not a match.
  const partial = item("3", { _title: "How to maintain a garden", url: "https://g.dev" });
  expect(matchedInterests(partial, DEFAULT_INTERESTS)).toEqual([]);
  const domain = item("4", { _title: "Weekly", url: "https://steam.example.com/x" });
  expect(matchedInterests(domain, DEFAULT_INTERESTS)).toEqual(["Gaming"]);
});

test("interests read from settings, with the defaults when there are none", () => {
  expect(interestsOf(undefined)).toBe(DEFAULT_INTERESTS);
  expect(
    interestsOf({ radarInterests: [{ name: " Rust ", keywords: ["rust", 3, ""] }, { name: "" }] }),
  ).toEqual([{ name: "Rust", keywords: ["rust"] }]);
});

test("the Settings box round-trips the interests", () => {
  expect(parseInterests(formatInterests(DEFAULT_INTERESTS))).toEqual(DEFAULT_INTERESTS);
  expect(parseInterests("  Rust : Cargo, , WASM\n\nTech")).toEqual([
    { name: "Rust", keywords: ["cargo", "wasm"] },
    { name: "Tech", keywords: [] },
  ]);
});

test("tabs: For you is new and matching, All is new, Saved is saved; newest first", () => {
  const items = [
    item("a", { _title: "AI agents", found_at: "2026-10-15T10:00:00Z" }),
    item("b", { _title: "Gardening", found_at: "2026-10-16T10:00:00Z" }),
    item("c", { _title: "Bitcoin", found_at: "2026-10-16T11:00:00Z" }),
    item("d", { _title: "Saved one", status: "saved" }),
    item("e", { _title: "AI gone", status: "dismissed" }),
    item("f", { _title: "AI deleted", _deleted: true }),
  ];
  const tabs = radarTabs(items, DEFAULT_INTERESTS);
  expect(tabs.forYou.map((d) => d.id)).toEqual(["c", "a"]);
  expect(tabs.all.map((d) => d.id)).toEqual(["c", "b", "a"]);
  expect(tabs.saved.map((d) => d.id)).toEqual(["d"]);
});

test("save makes an Inbox note once; saving again writes nothing", () => {
  const found = item("r1", {
    _title: "Claude 5.5",
    url: "https://www.anthropic.com/news/x",
    _body: '<img src=x onerror="alert(1)">',
  });
  const writes = saveWrites(found, undefined, () => "n1", "p1");
  expect(writes).toEqual([
    {
      id: "n1",
      collection: "notes",
      patch: {
        _title: "Claude 5.5",
        _body: 'From anthropic.com.\n\n<img src=x onerror="alert(1)">\n\n## My take\n',
        folder: "Inbox",
        source: "radar",
        url: "https://www.anthropic.com/news/x",
        project: "p1",
      },
    },
    { id: "r1", collection: RADAR, patch: { status: "saved", note: "n1" } },
  ]);
  const note: Doc = {
    id: "n1",
    kind: "item",
    collection: "notes",
    data: {},
    stamps: {},
    actor: "test",
  };
  expect(saveWrites(found, note, () => "n2")).toEqual([]);
  const deleted = { ...note, data: { _deleted: true } };
  expect(saveWrites(found, deleted, () => "n2")).toHaveLength(2);
});

test("migration 15 adds the collection and interests only where missing", () => {
  expect(radarMigration(() => undefined).map((d) => d.id)).toEqual([RADAR, "settings"]);
  const present = (id: string): Doc => ({
    id,
    kind: "setting",
    collection: null,
    data: { radarInterests: [] },
    stamps: {},
    actor: "test",
  });
  expect(radarMigration(present)).toEqual([]);
});
