import { expect, test } from "bun:test";
import { buildServiceWorker } from "./sw.ts";

test("bundles the service worker into one script served without caching", async () => {
  const res = await buildServiceWorker();
  expect(res.headers.get("cache-control")).toBe("no-cache");
  expect(res.headers.get("content-type")).toContain("javascript");
  const code = await res.text();
  expect(code).toContain("cave-shell");
  expect(code).not.toMatch(/^import /m);
});
