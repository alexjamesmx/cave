import { expect, test } from "bun:test";
import { staleShellEntries } from "./shell-cache.ts";

const origin = "http://127.0.0.1:3000";
const at = (path: string) => new URL(path, origin).href;

test("drops what the current page did not load, never /", () => {
  const cached = [
    at("/"),
    at("/chunk-old.css"),
    at("/chunk-new.css"),
    at("/c/money"),
    at("/main-old.js"),
  ];
  const loaded = [at("/c/tasks"), at("/chunk-new.css"), at("/main-new.js")];
  expect(staleShellEntries(cached, loaded, origin)).toEqual([
    at("/chunk-old.css"),
    at("/c/money"),
    at("/main-old.js"),
  ]);
});

test("nothing stale when the cache holds only the current release", () => {
  const loaded = [at("/"), at("/chunk-new.css")];
  expect(staleShellEntries(loaded, loaded, origin)).toEqual([]);
});
