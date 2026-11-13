import { expect, test } from "bun:test";
import { valueText } from "./field-text.ts";
import type { Field } from "./schema.ts";
import type { Doc } from "./types.ts";

const select: Field = {
  id: "list",
  name: "List",
  type: "select",
  options: [
    { value: "blind75", icon: "list", color: "#000000", label: "Blind 75", emoji: "📋" },
    { value: "bare", icon: "list", color: "#000000" },
  ],
};
const ref: Field = { id: "project", name: "Project", type: "ref", config: { collection: "p" } };
const docs = new Map<string, Doc>([
  [
    "p1",
    {
      id: "p1",
      kind: "item",
      collection: "p",
      data: { _title: " Kitchen " },
      stamps: {},
      actor: "seed",
    },
  ],
]);
const get = (id: string) => docs.get(id);

test("nothing worth a line is undefined; the rest reads as the app shows it", () => {
  for (const empty of [undefined, null, false, "", "  "])
    expect(valueText(undefined, empty, get)).toBeUndefined();
  expect(valueText(undefined, true, get)).toBe("yes");
  expect(valueText(undefined, 0, get)).toBe("0");
  expect(valueText(undefined, " text ", get)).toBe("text");
  expect(valueText(undefined, { a: [1] }, get)).toBe('{"a":[1]}');
  expect(valueText(select, "blind75", get)).toBe("📋 Blind 75");
  expect(valueText(select, "bare", get)).toBe("bare");
  expect(valueText(select, "gone", get)).toBe("gone");
  expect(valueText(ref, "p1", get)).toBe("Kitchen");
  expect(valueText(ref, "missing", get)).toBe("missing");
});
