import { expect, test } from "bun:test";
import type { CollectionData } from "../../../shared/schema.ts";
import { seedDocs } from "../../../shared/seed.ts";
import { hasIcon } from "./icon.tsx";

function seedIconNames(): string[] {
  const names: string[] = [];
  for (const doc of seedDocs()) {
    if (doc.kind !== "collection") continue;
    const data = doc.data as CollectionData;
    names.push(data.icon);
    for (const field of data.fields) for (const o of field.options ?? []) names.push(o.icon);
    for (const view of data.views) {
      const habits = view.config.habits as { icon: string }[] | undefined;
      for (const h of habits ?? []) names.push(h.icon);
    }
  }
  return names;
}

test("every icon named in the seed exists in the bundled Lucide set", () => {
  const names = seedIconNames();
  expect(names.length).toBeGreaterThan(40);
  expect(names.filter((name) => !hasIcon(name))).toEqual([]);
});

test("unknown names are reported as missing", () => {
  expect(hasIcon("house")).toBe(true);
  expect(hasIcon("not-an-icon")).toBe(false);
});
