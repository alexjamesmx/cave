import { expect, test } from "bun:test";
import { PALETTE, PALETTE_A, SWATCHES } from "./palette.ts";
import { recolourMigration, seedDocs, vividMigration } from "./seed.ts";
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

const category = (value: string, color: string) => ({ value, icon: "tag", color });
const money = (options: { value: string; icon: string; color: string }[]) =>
  doc("money", {
    color: PALETTE_A.ok,
    fields: [{ id: "category", name: "Category", type: "select", options }],
  });

test("M14: a seeded category still in its palette A colour gets its own swatch", () => {
  const out = vividMigration((id) =>
    id === "money"
      ? money([
          category("gula", PALETTE_A.purple),
          category("fun", PALETTE_A.purple),
          category("food", PALETTE_A.vio),
          category("mine", PALETTE_A.teal),
          category("kept", "#123456"),
        ])
      : undefined,
  );
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
              category("gula", SWATCHES.fuchsia),
              category("fun", SWATCHES.yellow),
              // The owner moved Food to violet: it stays violet, in the vivid violet.
              category("food", PALETTE.vio),
              category("mine", PALETTE.teal),
              category("kept", "#123456"),
            ],
          },
        ],
      },
    },
  ]);
});

test("M14: a fresh seed is already vivid, so the migration finds nothing to do", () => {
  const docs = seedDocs();
  expect(vividMigration((id) => docs.find((d) => d.id === id))).toEqual([]);
});
