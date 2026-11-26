import { type ReactNode, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone } from "../app/hooks.ts";
import { oncePerKey } from "../app/once.ts";
import { type Toast as SharedToast, showToast } from "../app/toast.ts";
import { type AgendaItem, type AgendaType, COLLECTION_OF, donePatch } from "../logic/agenda.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections, useItems } from "../store/queries.ts";
import { ItemDrawer } from "./ItemDrawer.tsx";
import { ReminderSheet } from "./ReminderForm.tsx";

/** A reminder's sheet (an existing one by id, or a new one on a day), or a drawer. */
type Editing = { type: AgendaType; id?: string; day?: string };

type Toast = Omit<SharedToast, "id">;

type Patch = Record<string, unknown>;

/** The values a patch is about to replace, so Undo can write them back. */
const before = (doc: Doc, patch: Patch) =>
  Object.fromEntries(Object.keys(patch).map((k) => [k, doc.data[k] ?? null]));

/**
 * What the calendar does with an item: open its editor (a reminder's sheet, a task's drawer),
 * add a reminder on a day, and ✓. Every ✓ is an ordinary stamped write, followed by a toast
 * with Undo that writes the previous values back. `overlay` renders the sheets and drawers;
 * toasts go to the shared stack.
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
  const [once] = useState(oncePerKey);

  const write = (collection: string, id: string, patch: Patch) =>
    local.write({ id, kind: "item", collection }, patch);

  /** Writes, and shows a refused value in the toast instead of throwing. */
  const attempt = async (run: () => Promise<Toast>) => {
    try {
      showToast(await run());
    } catch (e) {
      if (!(e instanceof FieldValueError)) throw e;
      showToast({ message: e.message });
    }
  };

  const done = (it: AgendaItem) => {
    const now = Date.now();
    const run = (task: () => Promise<Toast>) => {
      once(it.id, () => attempt(task));
    };
    const collection = COLLECTION_OF[it.type];
    const patch = donePatch(it, now, zone);
    const previous = before(it.doc, patch);
    run(async () => {
      await write(collection, it.id, patch);
      return {
        message: `Done · ${it.title}`,
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
            if (message) showToast({ message });
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
    </>
  );

  return {
    open: (type, id) => setEditing({ type, id }),
    add: (day) => setEditing({ type: "reminder", day }),
    done,
    overlay,
  };
}
