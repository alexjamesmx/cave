import { useSignal } from "../app/signal.ts";
import { dismissToast, showToast, toasts } from "../app/toast.ts";

/**
 * Every toast, stacked at the bottom centre (M14). Undo dismisses its toast, reverses the change
 * and says so.
 */
export function Toasts() {
  const list = useSignal(toasts);
  if (list.length === 0) return null;
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} role="status" className="panel toast">
          <span>{t.message}</span>
          {t.undo && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                dismissToast(t.id);
                void t.undo?.().then(() => showToast({ message: "Undone" }));
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
