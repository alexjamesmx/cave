import { isTyping } from "./router.ts";
import { createSignal } from "./signal.ts";

/** The forms the New sheet offers. */
export type QuickKind = "expense" | "task" | "reminder" | "payment" | "note";

/** The New sheet: closed, open on its choices, or open on one form. Any screen opens it. */
export const newSheet = createSignal<{ open: boolean; form?: QuickKind }>({ open: false });

export const openNew = (form?: QuickKind) =>
  newSheet.set(form ? { open: true, form } : { open: true });
export const closeNew = () => newSheet.set({ open: false });

/**
 * ⌘K or Ctrl+K opens the sheet; N opens it on a note (as C opens the calendar).
 * Neither fires while typing, and N never with a modifier held.
 */
export function newShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "target">,
): "open" | "note" | undefined {
  if (isTyping(event.target)) return undefined;
  const key = event.key.toLowerCase();
  if (key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) return "open";
  if (key === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) return "note";
  return undefined;
}
