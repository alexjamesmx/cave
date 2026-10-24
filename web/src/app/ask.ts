import { isTyping } from "./router.ts";
import { createSignal } from "./signal.ts";

/** The quick forms the Ask sheet offers beside the box. */
export type QuickKind = "expense" | "task" | "reminder" | "payment" | "note";

/** The Ask sheet: closed, open on the box, or open on one quick form. Any screen opens it. */
export const askSheet = createSignal<{ open: boolean; form?: QuickKind }>({ open: false });

export const openAsk = (form?: QuickKind) =>
  askSheet.set(form ? { open: true, form } : { open: true });
export const closeAsk = () => askSheet.set({ open: false });

/**
 * ⌘K or Ctrl+K opens the sheet on the box; N opens it on a note (as C opens the calendar).
 * Neither fires while typing, and N never with a modifier held.
 */
export function askShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "target">,
): "open" | "note" | undefined {
  if (isTyping(event.target)) return undefined;
  const key = event.key.toLowerCase();
  if (key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) return "open";
  if (key === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) return "note";
  return undefined;
}
