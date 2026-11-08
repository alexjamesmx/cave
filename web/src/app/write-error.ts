import { useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { useCave } from "./context.ts";

/** One item write: the item's id, its collection and the keys it sets. */
export interface PlannedWrite {
  id: string;
  collection: string;
  patch: Record<string, unknown>;
}

/** Runs writes in order; a refused value shows as `error` instead of throwing. */
export function useWriteError() {
  const { local } = useCave();
  const [error, setError] = useState<string>();
  return {
    error,
    async run(writes: PlannedWrite[]): Promise<boolean> {
      try {
        for (const w of writes)
          await local.write({ id: w.id, kind: "item", collection: w.collection }, w.patch);
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
