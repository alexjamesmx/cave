import { type ReactNode, useEffect, useState } from "react";

const TOAST_MS = 8000;

interface Toast {
  message: string;
  /** Reverses what was just written, through the same stamped writes. */
  undo?: () => Promise<unknown>;
}

/**
 * A toast for 8 seconds, with Undo when the change can be reversed (M14). Returns the toast
 * to render and the function that shows the next one in its place.
 */
export function useUndoToast(): [ReactNode, (toast: Toast) => void] {
  const [toast, setToast] = useState<Toast & { at: number }>();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const show = (next: Toast) => setToast({ ...next, at: Date.now() });
  const node = toast ? (
    <div key={toast.at} role="status" className="panel toast">
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            const undo = toast.undo;
            setToast(undefined);
            void undo?.().then(() => show({ message: "Undone" }));
          }}
        >
          Undo
        </button>
      )}
    </div>
  ) : null;
  return [node, show];
}
