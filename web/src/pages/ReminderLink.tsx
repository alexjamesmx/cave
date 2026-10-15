import { useEffect, useRef, useState } from "react";
import { complete, snooze } from "../../../shared/reminders.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone } from "../app/hooks.ts";
import { navigate } from "../app/router.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections, useDoc } from "../store/queries.ts";
import { ItemDrawer } from "../ui/ItemDrawer.tsx";
import { Icon } from "../ui/icon.tsx";

type Done = { label: string; before: Record<string, unknown> };

/**
 * Where a notification lands: the reminder in the drawer. `?do=done` or `?do=snooze60` (a
 * notification's buttons) acts once, then leaves the address so a reload doesn't act again.
 * No token lives in the service worker, so the action happens here, in the app.
 */
export function ReminderLink({ id }: { id: string }) {
  const { local } = useCave();
  const doc = useDoc(local.db, id);
  const collections = useCollections(local.db);
  const zone = useReminderZone();
  const acted = useRef(false);
  const [done, setDone] = useState<Done>();

  useEffect(() => {
    const action = new URLSearchParams(location.search).get("do");
    if (!action || !doc || acted.current) return;
    acted.current = true;
    history.replaceState(null, "", `/r/${encodeURIComponent(id)}`);
    if (doc.collection !== "reminders" || doc.data.done === true) return;
    const patch =
      action === "done"
        ? complete(doc, Date.now(), zone)
        : action === "snooze60"
          ? snooze(doc, 60, Date.now(), zone.timeZone)
          : undefined;
    if (!patch) return;
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, doc.data[k] ?? null]));
    const label = action === "done" ? "Done ✓" : `Snoozed to ${String(patch.due).slice(11, 16)}`;
    void local
      .write({ id, kind: "item", collection: "reminders" }, patch)
      .then(() => setDone({ label, before }));
  }, [doc, id, local, zone]);

  const reminders = collections?.find((c) => c.id === "reminders");
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ico" style={{ background: "#ff5c7a1f", color: "var(--expense)" }}>
          <Icon name="bell" size={20} />
        </span>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>Reminder</h1>
      </header>
      {done && (
        <p role="status" className="panel banner" style={{ margin: 0 }}>
          <span>{done.label}</span>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void local
                .write({ id, kind: "item", collection: "reminders" }, done.before)
                .then(() => setDone(undefined))
            }
          >
            <Icon name="undo-2" size={14} />
            Undo
          </button>
        </p>
      )}
      {!doc && <p className="muted">Not on this device yet. It appears once this device syncs.</p>}
      {doc && reminders && (
        <ItemDrawer
          collection={withActiveFields(reminders)}
          id={id}
          onClose={() => navigate("/calendar")}
        />
      )}
    </>
  );
}
