import { useEffect, useMemo, useState } from "react";
import { askSheet, askShortcut, closeAsk, openAsk, type QuickKind } from "../app/ask.ts";
import { useCave } from "../app/context.ts";
import { usePathname } from "../app/router.ts";
import { useSignal } from "../app/signal.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections } from "../store/queries.ts";
import { AskBox } from "./AskBox.tsx";
import { Icon } from "./icon.tsx";
import { MoneyForm } from "./MoneyForm.tsx";
import { NoteForm } from "./NoteForm.tsx";
import { PaymentForm } from "./PaymentForm.tsx";
import { ReminderForm, TaskForm } from "./QuickForms.tsx";
import { Sheet } from "./Sheet.tsx";

const QUICK: { kind: QuickKind; label: string; icon: string }[] = [
  { kind: "expense", label: "Expense", icon: "wallet" },
  { kind: "task", label: "Task", icon: "square-check" },
  { kind: "reminder", label: "Reminder", icon: "bell" },
  { kind: "payment", label: "Payment", icon: "calendar-clock" },
  { kind: "note", label: "Note", icon: "notebook-pen" },
];

const TOAST_MS = 8000;

/**
 * Ask or tell the Cave anything, from any screen (M11): the box that opens Claude and the five
 * quick forms, in one sheet. The rail's Ask, the dock's Ask, ⌘K and N open it; navigating,
 * Escape, the scrim and a save close it. What was saved shows for a moment as a toast.
 */
export function AskSheet() {
  const state = useSignal(askSheet);
  const { local } = useCave();
  const stored = useCollections(local.db);
  const collections = useMemo(() => stored?.map(withActiveFields), [stored]);
  const [saved, setSaved] = useState<string>();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kind = askShortcut(e);
      if (!kind || e.defaultPrevented) return;
      e.preventDefault();
      openAsk(kind === "note" ? "note" : undefined);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // Navigating closes the sheet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => closeAsk(), [pathname]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const quick = state.form;
  const pick = (kind: QuickKind) =>
    askSheet.set({ open: true, ...(quick === kind ? {} : { form: kind }) });
  const done = (message: string) => {
    setSaved(message);
    closeAsk();
  };
  return (
    <>
      {state.open && (
        <Sheet title="Ask" onClose={closeAsk}>
          <AskBox autoFocus={quick === undefined} onAsked={closeAsk} />
          <fieldset className="quick-actions">
            <legend className="sr">Quick actions</legend>
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
