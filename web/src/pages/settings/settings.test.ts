import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;

/** Section content Settings must not show: money and task logic, and the sections' own pages. */
const FORBIDDEN = [/\/logic\/money/, /\/logic\/tasks/, /\/logic\/payments/, /\/views\//];

test("Settings pages hold only general things: no money, task or section view imports", () => {
  const pages = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
  expect(pages.length).toBeGreaterThanOrEqual(5);
  for (const file of pages) {
    const source = readFileSync(join(DIR, file), "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1] as string);
    for (const spec of imports)
      for (const rule of FORBIDDEN)
        expect([file, spec, rule.test(spec)]).toEqual([file, spec, false]);
    // The raw collection page belongs to Data alone.
    const pagesImports = imports.filter((s) => s.startsWith("../") && !s.startsWith("../../"));
    expect([file, pagesImports]).toEqual([
      file,
      file === "Data.tsx" ? ["../CollectionPage.tsx"] : [],
    ]);
  }
});
