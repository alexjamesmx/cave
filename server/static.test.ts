import { afterAll, beforeAll, expect, test } from "bun:test";
import { serveCave } from "./app.ts";
import { openDb } from "./db.ts";
import { createStore } from "./store.ts";

let server: ReturnType<typeof serveCave>;
beforeAll(() => {
  const store = createStore(openDb(":memory:"));
  server = serveCave({ hostname: "127.0.0.1", port: 0, store, token: undefined, now: Date.now });
});
afterAll(() => server.stop(true));

const get = (path: string) => fetch(new URL(path, server.url));

test("every icon the manifest names is served", async () => {
  const manifest = (await Bun.file(
    new URL("../web/manifest.webmanifest", import.meta.url),
  ).json()) as { icons: { src: string; type: string }[] };
  for (const icon of manifest.icons) {
    const res = await get(icon.src);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(icon.type);
  }
});

test("serves only the listed icon files", async () => {
  expect((await get("/icons/icon.svg")).headers.get("content-type")).toBe("image/svg+xml");
  expect((await get("/icons/..%2F..%2Fpackage.json")).status).toBe(404);
  expect((await get("/icons/missing.png")).status).toBe(404);
});
