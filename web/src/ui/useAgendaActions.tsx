import { type ReactNode, useEffect, useRef, useState } from "react";
import { localDateTime } from "../../../shared/dates.ts";
import { FieldValueError, offeredOptions } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { expenseFrom, PAYMENTS, paidPatch } from "../../../shared/payments.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone } from "../app/hooks.ts";
import { type AgendaItem, type AgendaType, COLLECTION_OF, donePatch } from "../logic/agenda.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { paidEntry } from "../logic/subscription-paid.ts";
import { titleOf } from "../logic/views.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { ItemDrawer } from "./ItemDrawer.tsx";
import { MoneyForm } from "./MoneyForm.tsx";
import { ReminderSheet } from "./ReminderForm.tsx";
import { Sheet } from "./Sheet.tsx";

const TOAST_MS = 8000;

/** A reminder's sheet (an existing one by id, or a new one on a day), or a drawer. */
type Editing = { type: AgendaType; id?: string; day?: string };

interface Toast {
  label: string;
  undo?: () => Promise<unknown>;
}

type Patch = Record<string, unknown>;

/** The values a patch is about to replace, so Undo can write them back. */
const before = (doc: Doc, patch: Patch) =>
  Object.fromEntries(Object.keys(patch).map((k) => [k, doc.data[k] ?? null]));

/**
 * What the calendar does with an item: open its editor (a reminder's sheet, a task's or a
 * payment's drawer), add a reminder on a day, and ✓. Every ✓ is an ordinary stamped write,
 * followed by a toast with Undo that writes the previous values back. A payment's ✓ logs its
 * expense, linked, then moves it to its next date; when its amount varies the expense form
 * asks for it first. `overlay` renders the sheets, drawers and the toast.
 */
export function useAgendaActions(): {
  open(type: AgendaType, id: string): void;
  add(day: string): void;
  done(item: AgendaItem): void;
  overlay: ReactNode;
} {
  const { local } = useCave();
  const collections = useCollections(local.db);
  const reminders = useItems(local.db, "reminders");
  const zone = useReminderZone();
  const [editing, setEditing] = useState<Editing>();
  const [paying, setPaying] = useState<Doc>();
  const [toast, setToast] = useState<Toast>();
  const busy = useRef(new Set<string>());

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const write = (collection: string, id: string, patch: Patch) =>
    local.write({ id, kind: "item", collection }, patch);

  /** Writes, and shows a refused value in the toast instead of throwing. */
  const attempt = async (run: () => Promise<Toast>) => {
    try {
      setToast(await run());
    } catch (e) {
      if (!(e instanceof FieldValueError)) throw e;
      setToast({ label: e.message });
    }
  };

  /** The payment moves on once its expense `expense` is saved. */
  const paid = async (payment: Doc, expense: string): Promise<Toast> => {
    const patch = paidPatch(payment, Date.now(), zone);
    const previous = before(payment, patch);
    await write(PAYMENTS, payment.id, patch);
    return {
      label: `Paid · ${titleOf(payment)}`,
      undo: async () => {
        await write("money", expense, { _deleted: true });
        await write(PAYMENTS, payment.id, previous);
      },
    };
  };

  const done = (it: AgendaItem) => {
    // A second tap before the first write lands would log a second expense or skip a date.
    if (busy.current.has(it.id)) return;
    const now = Date.now();
    const run = (task: () => Promise<Toast>) => {
      busy.current.add(it.id);
      void attempt(task).finally(() => busy.current.delete(it.id));
    };
    if (it.type === "payment") {
      const money = collections?.find((c) => c.id === "money")?.data.fields;
      const listOf = (id: string) => {
        const field = money?.find((f) => f.id === id);
        return field ? offeredOptions(field) : [];
      };
      const expense = paidEntry(
        it.doc,
        listOf("category"),
        listOf("account"),
        localDateTime(new Date(now), zone.timeZone),
      );
      if (!expense) {
        setPaying(it.doc);
        return;
      }
      run(async () => {
        const id = newId();
        await write("money", id, expense);
        return paid(it.doc, id);
      });
      return;
    }
    const collection = COLLECTION_OF[it.type];
    const patch = donePatch(it, now, zone);
    const previous = before(it.doc, patch);
    run(async () => {
      await write(collection, it.id, patch);
      return {
        label: `Done · ${it.title}`,
        undo: () => write(collection, it.id, previous),
      };
    });
  };

  const reminder =
    editing?.type === "reminder" && editing.id
      ? reminders?.find((d) => d.id === editing.id)
      : undefined;
  const drawer =
    editing && editing.type !== "reminder"
      ? collections?.find((c) => c.id === COLLECTION_OF[editing.type])
      : undefined;

  const overlay = (
    <>
      {editing?.type === "reminder" && (!editing.id || reminder) && (
        <ReminderSheet
          key={editing.id ?? editing.day}
          doc={reminder}
          day={editing.day}
          onClose={(message) => {
            setEditing(undefined);
            if (message) setToast({ label: message });
          }}
        />
      )}
      {editing?.id && drawer && editing.type !== "reminder" && (
        <ItemDrawer
          key={editing.id}
          collection={withActiveFields(drawer)}
          id={editing.id}
          onClose={() => setEditing(undefined)}
        />
      )}
      {paying && (
        <Sheet title={`Paid · ${titleOf(paying)}`} onClose={() => setPaying(undefined)}>
          <MoneyForm
            prefill={expenseFrom(paying)}
            submitLabel="Save expense and mark paid"
            onSaved={(expense) => {
              const payment = paying;
              setPaying(undefined);
              void attempt(async () => {
                await write("money", expense, { payment: payment.id });
                return paid(payment, expense);
              });
            }}
          />
        </Sheet>
      )}
      {toast && (
        <p role="status" className="panel toast">
          {toast.label}
          {toast.undo && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const { undo } = toast;
                setToast(undefined);
                void undo?.();
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
    </>
  );

  return {
    open: (type, id) => setEditing({ type, id }),
    add: (day) => setEditing({ type: "reminder", day }),
    done,
    overlay,
  };
}
