import { expect, test } from "bun:test";
import { PALETTE } from "./palette.ts";
import { recolourMigration, seedDocs } from "./seed.ts";
import type { Doc } from "./types.ts";

const stamp = "0000000000000:0000:seed";
const doc = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  kind: "collection",
  collection: null,
  data,
  stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
  actor: "seed",
});

test("a collection still in the old seed colours is recoloured, options included", () => {
  const money = doc("money", {
    color: "#2EE6A6",
    fields: [
      {
        id: "category",
        name: "Category",
        type: "select",
        options: [
          { value: "food", icon: "utensils", color: "#FF9F43" },
          { value: "mine", icon: "tag", color: "#123456" },
        ],
      },
      { id: "amount", name: "Amount", type: "money" },
    ],
  });
  const out = recolourMigration((id) => (id === "money" ? money : undefined));
  expect(out).toEqual([
    {
      id: "money",
      kind: "collection",
      data: {
        color: PALETTE.ok,
        fields: [
          {
            id: "category",
            name: "Category",
            type: "select",
            options: [
              { value: "food", icon: "utensils", color: PALETTE.orange },
              { value: "mine", icon: "tag", color: "#123456" },
            ],
          },
          { id: "amount", name: "Amount", type: "money" },
        ],
      },
    },
  ]);
});

test("a collection the owner recoloured, a deleted one and a missing one are left alone", () => {
  const tasks = doc("tasks", { color: "#abcdef", fields: [] });
  const gone = doc("ideas", { color: "#B6FF3B", _deleted: true });
  const out = recolourMigration((id) => ({ tasks, ideas: gone })[id]);
  expect(out).toEqual([]);
});

test("a fresh seed is already in palette A, so the migration finds nothing to do", () => {
  const docs = seedDocs();
  const out = recolourMigration((id) => docs.find((d) => d.id === id));
  expect(out).toEqual([]);
});
