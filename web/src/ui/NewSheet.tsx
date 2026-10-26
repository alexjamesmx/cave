import { useEffect, useMemo, useState } from "react";
import { useCave } from "../app/context.ts";
import { closeNew, newSheet, newShortcut, openNew, type QuickKind } from "../app/quick.ts";
import { usePathname } from "../app/router.ts";
import { useSignal } from "../app/signal.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections } from "../store/queries.ts";
import { Icon } from "./icon.tsx";
import { MoneyForm } from "./MoneyForm.tsx";
import { NoteForm } from "./NoteForm.tsx";
import { PaymentForm } from "./PaymentForm.tsx";
import { ReminderForm, TaskForm } from "./QuickForms.tsx";
import { Sheet } from "./Sheet.tsx";

const QUICK: { kind: QuickKind; label: string; icon: string }[] = [
  { kind: "expense", label: "Money", icon: "wallet" },
  { kind: "task", label: "Task", icon: "square-check" },
  { kind: "reminder", label: "Reminder", icon: "bell" },
  { kind: "payment", label: "Payment", icon: "calendar-clock" },
  { kind: "note", label: "Note", icon: "notebook-pen" },
];

const TOAST_MS = 8000;

/**
 * Add anything from any screen: five short forms in one sheet.
 * The rail's New, the dock's New, ⌘K and N open it; navigating, Escape, the scrim and a save
 * close it. What was saved shows for a moment as a toast.
 */
export function NewSheet() {
  const state = useSignal(newSheet);
  const { local } = useCave();
  const stored = useCollections(local.db);
  const collections = useMemo(() => stored?.map(withActiveFields), [stored]);
  const [saved, setSaved] = useState<string>();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kind = newShortcut(e);
      if (!kind || e.defaultPrevented) return;
      e.preventDefault();
      openNew(kind === "note" ? "note" : undefined);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // Navigating closes the sheet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => closeNew(), [pathname]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const quick = state.form;
  const pick = (kind: QuickKind) =>
    newSheet.set({ open: true, ...(quick === kind ? {} : { form: kind }) });
  const done = (message: string) => {
    setSaved(message);
    closeNew();
  };
  return (
    <>
      {state.open && (
        <Sheet title="New" onClose={closeNew}>
          <fieldset className="quick-actions">
            <legend className="sr">What to add</legend>
            {QUICK.map((q) => (
              <button
                key={q.kind}
                type="button"
                className={`btn${quick === q.kind ? " primary" : ""}`}
                aria-expanded={quick === q.kind}
                onClick={() => pick(q.kind)}
              >
                <Icon name={q.icon} size={15} /> {q.label}
              </button>
            ))}
          </fieldset>
          {quick === "expense" && <MoneyForm onSaved={(_id, message) => done(message)} />}
          {collections && quick === "task" && <TaskForm collections={collections} onDone={done} />}
          {quick === "payment" && <PaymentForm onSaved={done} />}
          {quick === "note" && <NoteForm onDone={done} />}
          {collections && quick === "reminder" && (
            <ReminderForm collections={collections} onDone={done} />
          )}
        </Sheet>
      )}
      {saved && (
        <p role="status" className="panel toast">
          {saved}
        </p>
      )}
    </>
  );
}
