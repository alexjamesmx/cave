import { expect, test } from "bun:test";
import { unresolved } from "../../../shared/fields.ts";
import type { Field, SelectOption } from "../../../shared/schema.ts";
import { addOption, isHexColor, moveOption, patchOption, setArchived } from "./options.ts";

const o = (value: string, extra: Partial<SelectOption> = {}): SelectOption => ({
  value,
  icon: "tag",
  color: "#8C93A0",
  ...extra,
});

test("adding trims, refuses a duplicate in any case, and points at an archived one", () => {
  const list = [o("Nu"), o("BBVA", { archived: true })];
  expect(addOption(list, "  Cash ")).toEqual({ options: [...list, o("Cash")] });
  expect(addOption(list, "nu")).toEqual({ error: "“Nu” is already in the list" });
  expect(addOption(list, "bbva")).toEqual({ error: "“BBVA” is archived; restore it instead" });
  expect(addOption(list, " ")).toEqual({ error: "Type a name first" });
});

test("rename and look change only label, emoji, colour and kind; the value stays", () => {
  const [renamed] = patchOption([o("food")], "food", {
    label: "Comida",
    emoji: "🌮",
    kind: "expense",
  });
  expect(renamed).toEqual({ ...o("food"), label: "Comida", emoji: "🌮", kind: "expense" });
  const [cleared] = patchOption([renamed as SelectOption], "food", { label: "", emoji: undefined });
  expect(cleared).toEqual({ ...o("food"), kind: "expense" });
});

test("reorder, archive and restore", () => {
  const list = [o("a"), o("b"), o("c")];
  expect(moveOption(list, 2, 0).map((x) => x.value)).toEqual(["c", "a", "b"]);
  expect(moveOption(list, 0, 9).map((x) => x.value)).toEqual(["b", "c", "a"]);
  const archived = setArchived(list, "b", true);
  expect(archived[1]).toEqual(o("b", { archived: true }));
  expect(setArchived(archived, "b", false)[1]).toEqual(o("b"));
});

test("colours are #RRGGBB", () => {
  expect(["#B6FF3B", "#b6ff3b", "#fff", "B6FF3B", "#B6FF3BAA"].map(isHexColor)).toEqual([
    true,
    true,
    false,
    false,
    false,
  ]);
});

test("a shared list's resolved options are never saved back as a copy", () => {
  const fields: Field[] = [
    {
      id: "category",
      name: "Category",
      type: "select",
      options: [o("food")],
      config: { optionsFrom: { collection: "money", field: "category" } },
    },
    { id: "kind", name: "Kind", type: "select", options: [o("bill")] },
  ];
  expect(unresolved(fields)).toEqual([
    {
      id: "category",
      name: "Category",
      type: "select",
      config: { optionsFrom: { collection: "money", field: "category" } },
    },
    fields[1] as Field,
  ]);
});
