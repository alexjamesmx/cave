import { createSignal } from "./signal.ts";

/** What the app just did, for a moment, with Undo when it can be reversed. */
export interface Toast {
  id: number;
  message: string;
  /** Reverses what was just written, through the same stamped writes. */
  undo?: () => Promise<unknown>;
}

export const TOAST_MS = 8000;

/**
 * Every toast on screen (M14), newest last. One list for the whole app, so a save from New and
 * an Undo from a page stack instead of landing on top of each other.
 */
export const toasts = createSignal<Toast[]>([]);

let next = 0;

export function dismissToast(id: number): void {
  toasts.set(toasts.get().filter((t) => t.id !== id));
}

/** Shows a toast for 8 seconds; one with the same message replaces the older one. */
export function showToast(t: Omit<Toast, "id">): void {
  const id = ++next;
  const toast: Toast = { ...t, id };
  toasts.set([...toasts.get().filter((o) => o.message !== t.message), toast].slice(-3));
  setTimeout(() => dismissToast(id), TOAST_MS);
}
