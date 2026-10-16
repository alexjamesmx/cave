import { beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildServiceWorker } from "../server/sw.ts";

/**
 * Everything the server sends without a token: the page, its JS and CSS, the service worker,
 * the manifest and the SVG icon. None of it may carry personal data or fixed figures.
 */
const DENY: (string | RegExp)[] = [
  "alexjamesmx",
  /\bAlex\b/,
  "16,842",
  "16842",
  "6,024",
  "6024",
  "15040",
  "15,040",
  "205 tacos",
  "SYNCED · 2 DEVICES",
  "Pay rent",
  "15000",
];

/**
 * Item text from the server's test fixtures: titles, bodies and details. Their collection
 * schemas are the app's own words ("Money", "Amount") and are expected in the bundle.
 */
function fixtureStrings(): string[] {
  const dir = join(import.meta.dir, "..", "server", "fixtures");
  const docs = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap(
      (name) =>
        JSON.parse(readFileSync(join(dir, name), "utf8")) as {
          kind: string;
          data: Record<string, unknown>;
        }[],
    );
  const found = new Set<string>();
  for (const doc of docs) {
    if (doc.kind !== "item") continue;
    for (const key of ["_title", "_body", "detail"]) {
      const value = doc.data[key];
      if (typeof value === "string" && value.trim().length >= 6) found.add(value.trim());
    }
  }
  return [...found];
}

const shipped: { name: string; text: string }[] = [];

beforeAll(async () => {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "index.html")],
    target: "browser",
    minify: true,
  });
  if (!result.success) throw new AggregateError(result.logs, "web build failed");
  for (const output of result.outputs)
    if (/\.(html|js|css|webmanifest|json|svg)$/.test(output.path))
      shipped.push({ name: output.path, text: await output.text() });
  shipped.push({ name: "sw.js", text: await (await buildServiceWorker()).text() });
  for (const file of ["manifest.webmanifest", "icons/icon.svg"])
    shipped.push({ name: file, text: readFileSync(join(import.meta.dir, file), "utf8") });
}, 60_000);

test("the bundle is built and includes the app's code", () => {
  expect(shipped.some((s) => s.name.endsWith(".js") && s.text.length > 10_000)).toBe(true);
});

test("nothing sent without a token holds the owner's name, fixed figures or fixture data", () => {
  const fixtures = fixtureStrings();
  const leaks: string[] = [];
  for (const { name, text } of shipped) {
    for (const deny of [...DENY, ...fixtures]) {
      const hit = typeof deny === "string" ? text.includes(deny) : deny.test(text);
      if (hit) leaks.push(`${name}: ${String(deny)}`);
    }
  }
  expect(leaks).toEqual([]);
});
