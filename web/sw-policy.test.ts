import { expect, test } from "bun:test";
import { isShellRequest } from "./sw-policy.ts";

const origin = "http://127.0.0.1:3000";
const shell = (path: string, method = "GET", base = origin) =>
  isShellRequest(method, new URL(path, base).href, origin);

test("same-origin GETs of the app are cached", () => {
  expect(shell("/")).toBe(true);
  expect(shell("/c/money/table")).toBe(true);
  expect(shell("/_bun/asset/abc.png")).toBe(true);
  expect(shell("/chunk-79r311ev.css")).toBe(true);
});

test("the API, MCP, other methods and other origins never are", () => {
  expect(shell("/api/sync")).toBe(false);
  expect(shell("/api/history/t1")).toBe(false);
  expect(shell("/mcp")).toBe(false);
  expect(shell("/", "POST")).toBe(false);
  expect(shell("/", "GET", "https://fonts.googleapis.com")).toBe(false);
});

test("paths that only start like the API are still the app", () => {
  expect(shell("/apiary")).toBe(true);
  expect(shell("/mcpx")).toBe(true);
});
