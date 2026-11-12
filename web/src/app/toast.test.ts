import { expect, test } from "bun:test";
import { dismissToast, showToast, toasts } from "./toast.ts";

test("toasts stack newest last, keep three, and a repeated message replaces the older one", () => {
  toasts.set([]);
  showToast({ message: "Saved · Task · A" });
  showToast({ message: "Done · B", undo: async () => undefined });
  expect(toasts.get().map((t) => t.message)).toEqual(["Saved · Task · A", "Done · B"]);
  expect(toasts.get()[1]?.undo).toBeDefined();
  showToast({ message: "Saved · Task · A" });
  expect(toasts.get().map((t) => t.message)).toEqual(["Done · B", "Saved · Task · A"]);
  showToast({ message: "C" });
  showToast({ message: "D" });
  expect(toasts.get().map((t) => t.message)).toEqual(["Saved · Task · A", "C", "D"]);
  dismissToast(toasts.get()[0]?.id ?? -1);
  expect(toasts.get().map((t) => t.message)).toEqual(["C", "D"]);
  toasts.set([]);
});
