import { expect, test } from "bun:test";
import { closeNew, newSheet, newShortcut, openNew } from "./quick.ts";

const key = (
  k: string,
  mods: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">> = {},
  target: Record<string, unknown> | null = { tagName: "BODY" },
) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods, target: target as never });

test("⌘K or Ctrl+K opens the sheet, N opens a note, never while typing", () => {
  expect(newShortcut(key("k", { metaKey: true }))).toBe("open");
  expect(newShortcut(key("K", { ctrlKey: true }))).toBe("open");
  expect(newShortcut(key("k"))).toBeUndefined();
  expect(newShortcut(key("k", { ctrlKey: true, altKey: true }))).toBeUndefined();
  expect(newShortcut(key("n"))).toBe("note");
  expect(newShortcut(key("n", { ctrlKey: true }))).toBeUndefined();
  expect(newShortcut(key("n", {}, { tagName: "INPUT" }))).toBeUndefined();
  expect(newShortcut(key("k", { metaKey: true }, { tagName: "TEXTAREA" }))).toBeUndefined();
  expect(newShortcut(key("x"))).toBeUndefined();
});

test("the sheet opens on the box or on a form, and closes", () => {
  expect(newSheet.get()).toEqual({ open: false });
  openNew();
  expect(newSheet.get()).toEqual({ open: true });
  openNew("task");
  expect(newSheet.get()).toEqual({ open: true, form: "task" });
  closeNew();
  expect(newSheet.get()).toEqual({ open: false });
});
