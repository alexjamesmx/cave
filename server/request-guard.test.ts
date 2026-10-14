import { expect, test } from "bun:test";
import { guardRequest, LOOPBACK_HOSTS } from "./request-guard.ts";

const req = (
  headers: Record<string, string>,
  method = "POST",
  url = "http://127.0.0.1:3000/api/sync",
) => new Request(url, { method, headers: { "content-type": "application/json", ...headers } });
const status = (r: Request, hosts = LOOPBACK_HOSTS) => guardRequest(r, hosts)?.status ?? 200;

test("allowed hosts pass, with or without a port", () => {
  expect(status(req({ host: "127.0.0.1:3000" }))).toBe(200);
  expect(status(req({ host: "localhost:3000" }, "POST", "http://localhost:3000/api/sync"))).toBe(
    200,
  );
  expect(status(req({ host: "[::1]:3000" }, "POST", "http://[::1]:3000/api/sync"))).toBe(200);
  const tailnet = req({ host: "laptop.ts.net:3000" }, "POST", "http://laptop.ts.net:3000/mcp");
  expect(status(tailnet, [...LOOPBACK_HOSTS, "laptop.ts.net"])).toBe(200);
});

test("a rebinding host name is refused", () => {
  expect(status(req({ host: "evil.example:3000" }))).toBe(403);
  expect(status(req({ host: "" }))).toBe(403);
});

test("Origin must match scheme, host and port exactly", () => {
  expect(status(req({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }))).toBe(200);
  expect(status(req({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:5173" }))).toBe(403);
  expect(status(req({ host: "127.0.0.1:3000", origin: "https://127.0.0.1:3000" }))).toBe(403);
  expect(status(req({ host: "127.0.0.1:3000", origin: "http://localhost:3000" }))).toBe(403);
  expect(status(req({ host: "127.0.0.1:3000", origin: "null" }))).toBe(403);
});

test("a POST must be JSON; GET needs no body type", () => {
  expect(status(req({ host: "127.0.0.1:3000", "content-type": "text/plain" }))).toBe(415);
  expect(
    status(req({ host: "127.0.0.1:3000", "content-type": "application/json; charset=utf-8" })),
  ).toBe(200);
  const get = new Request("http://127.0.0.1:3000/api/agents", {
    headers: { host: "127.0.0.1:3000" },
  });
  expect(status(get)).toBe(200);
});

test("behind a proxy the public https origin passes and its http twin does not", () => {
  const PUBLIC = "https://cave.example.dev";
  const hosts = [...LOOPBACK_HOSTS, "cave.example.dev"];
  // What Caddy forwards: the original Host, while Bun builds req.url with http:.
  const proxied = (origin?: string) =>
    req(
      { host: "cave.example.dev", ...(origin ? { origin } : {}) },
      "POST",
      "http://cave.example.dev/api/sync",
    );
  const check = (r: Request) => guardRequest(r, hosts, PUBLIC)?.status ?? 200;
  expect(check(proxied(PUBLIC))).toBe(200);
  expect(check(proxied())).toBe(200);
  expect(check(proxied("http://cave.example.dev"))).toBe(403);
  expect(check(proxied("https://evil.example"))).toBe(403);
  expect(check(proxied("https://cave.example.dev:8443"))).toBe(403);
  // Forwarded headers change nothing.
  const forged = req(
    {
      host: "cave.example.dev",
      origin: "https://evil.example",
      "x-forwarded-host": "evil.example",
    },
    "POST",
    "http://cave.example.dev/api/sync",
  );
  expect(check(forged)).toBe(403);
});

test("another host is refused even with the public origin", () => {
  const hosts = [...LOOPBACK_HOSTS, "cave.example.dev"];
  const other = req({ host: "evil.example", origin: "https://cave.example.dev" });
  expect(guardRequest(other, hosts, "https://cave.example.dev")?.status).toBe(403);
});

test("a local request on the server itself still uses its own origin", () => {
  const local = req({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" });
  expect(guardRequest(local, LOOPBACK_HOSTS, "https://cave.example.dev")).toBeUndefined();
});
