import type { Change } from "../../../shared/types.ts";
import { type UndoPlan, undoPatch } from "../../../shared/undo.ts";
import type { LocalStore } from "../store/local-store.ts";

type UndoResult = { ok: true; plan: UndoPlan } | { ok: false; error: string };

/**
 * Undoes an agent's change from this device. It syncs first and plans from the fresh copy:
 * planning from a stale copy would restore a key another device edited after the agent,
 * because this device would not know that key had changed since. No sync, no undo.
 */
export async function undoChange(
  change: Change,
  local: LocalStore,
  sync: () => Promise<boolean>,
): Promise<UndoResult> {
  if (!(await sync())) return { ok: false, error: "Needs a sync first" };
  const doc = await local.get(change.id);
  const plan = undoPatch(change, doc);
  if (doc && Object.keys(plan.patch).length > 0) {
    await local.write({ id: doc.id, kind: doc.kind, collection: doc.collection }, plan.patch, {
      selectMembership: false,
    });
  }
  return { ok: true, plan };
}
