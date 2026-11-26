import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useCave } from "../app/context.ts";
import { closeNew, newSheet, newShortcut, openNew, type QuickKind } from "../app/quick.ts";
import { usePathname } from "../app/router.ts";
import { useSignal } from "../app/signal.ts";
import { showToast } from "../app/toast.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections } from "../store/queries.ts";
import { MoneyForm } from "./MoneyForm.tsx";
import { NoteForm } from "./NoteForm.tsx";
import { TaskForm } from "./QuickForms.tsx";
import { ReminderForm } from "./ReminderForm.tsx";
import { Sheet } from "./Sheet.tsx";

const QUICK: { kind: QuickKind; label: string; emoji: string; color: string }[] = [
  { kind: "expense", label: "Money", emoji: "💸", color: "#34d399" },
  { kind: "task", label: "Task", emoji: "✅", color: "#60a5fa" },
  { kind: "reminder", label: "Reminder", emoji: "🔔", color: "#fb7185" },
  { kind: "note", label: "Note", emoji: "📝", color: "#a78bfa" },
];

/**
 * Add anything from any screen: four short forms in one sheet.
 * The rail's New, the dock's New, ⌘K and N open it; navigating, Escape and the scrim close it.
 * A save shows as a toast and leaves the same form open and empty, for the next one.
 */
export function NewSheet() {
  const state = useSignal(newSheet);
  const { local } = useCave();
  const stored = useCollections(local.db);
  const collections = useMemo(() => stored?.map(withActiveFields), [stored]);
  const pathname = usePathname();
  // Bumped by each save: the form remounts empty.
  const [saved, setSaved] = useState(0);

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

  const quick = state.form;
  const pick = (kind: QuickKind) =>
    newSheet.set({ open: true, ...(quick === kind ? {} : { form: kind }) });
  const done = (message: string) => {
    showToast({ message });
    setSaved((n) => n + 1);
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
                className="quick-kind"
                aria-expanded={quick === q.kind}
                style={{ "--c": q.color } as CSSProperties}
                onClick={() => pick(q.kind)}
              >
                <span className="emoji-tile" aria-hidden="true" data-emoji={q.emoji} />
                {q.label}
              </button>
            ))}
          </fieldset>
          {quick === "expense" && (
            <MoneyForm key={saved} onSaved={(_id, message) => done(message)} />
          )}
          {collections && quick === "task" && (
            <TaskForm key={saved} collections={collections} onDone={done} />
          )}
          {quick === "note" && <NoteForm key={saved} onDone={done} />}
          {quick === "reminder" && <ReminderForm key={saved} onDone={done} />}
        </Sheet>
      )}
    </>
  );
}
