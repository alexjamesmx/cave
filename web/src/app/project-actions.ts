import { useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import type { PlannedWrite } from "../../../shared/projects.ts";
import type { LocalStore } from "../store/local-store.ts";
import { useCave } from "./context.ts";

/** Writes in order, so a part's project exists on this device before the part points at it. */
async function applyWrites(local: LocalStore, writes: PlannedWrite[]): Promise<void> {
  for (const w of writes)
    await local.write({ id: w.id, kind: "item", collection: w.collection }, w.patch);
}

/** Runs planned writes; a refused value shows as `error` instead of throwing. */
export function useWriteError() {
  const { local } = useCave();
  const [error, setError] = useState<string>();
  return {
    error,
    async run(writes: PlannedWrite[]): Promise<boolean> {
      try {
        await applyWrites(local, writes);
        setError(undefined);
        return true;
      } catch (e) {
        if (!(e instanceof FieldValueError)) throw e;
        setError(e.message);
        return false;
      }
    },
  };
}
