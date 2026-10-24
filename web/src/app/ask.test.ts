import { expect, test } from "bun:test";
import { askSheet, askShortcut, closeAsk, openAsk } from "./ask.ts";

const key = (
  k: string,
  mods: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">> = {},
  target: Record<string, unknown> | null = { tagName: "BODY" },
) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods, target: target as never });

test("⌘K or Ctrl+K opens the sheet, N opens a note, never while typing", () => {
  expect(askShortcut(key("k", { metaKey: true }))).toBe("open");
  expect(askShortcut(key("K", { ctrlKey: true }))).toBe("open");
  expect(askShortcut(key("k"))).toBeUndefined();
  expect(askShortcut(key("k", { ctrlKey: true, altKey: true }))).toBeUndefined();
  expect(askShortcut(key("n"))).toBe("note");
  expect(askShortcut(key("n", { ctrlKey: true }))).toBeUndefined();
  expect(askShortcut(key("n", {}, { tagName: "INPUT" }))).toBeUndefined();
  expect(askShortcut(key("k", { metaKey: true }, { tagName: "TEXTAREA" }))).toBeUndefined();
  expect(askShortcut(key("x"))).toBeUndefined();
});

test("the sheet opens on the box or on a form, and closes", () => {
  expect(askSheet.get()).toEqual({ open: false });
  openAsk();
  expect(askSheet.get()).toEqual({ open: true });
  openAsk("task");
  expect(askSheet.get()).toEqual({ open: true, form: "task" });
  closeAsk();
  expect(askSheet.get()).toEqual({ open: false });
});
