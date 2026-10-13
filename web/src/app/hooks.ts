import { useEffect, useState } from "react";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { localDate } from "../logic/dates.ts";
import { useDoc } from "../store/queries.ts";
import { useCave } from "./context.ts";

export function useTimeZone(): string | undefined {
  const settings = useDoc(useCave().local.db, "settings");
  const tz = settings?.data.timezone;
  return typeof tz === "string" ? tz : undefined;
}

/** Today's local date in the settings timezone; re-checked every minute so midnight rolls over. */
export function useToday(): string {
  const timeZone = useTimeZone();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return localDate(now, timeZone);
}

export interface Saver {
  save(id: string, patch: Record<string, unknown>): Promise<boolean>;
  create(patch: Record<string, unknown>): Promise<string | undefined>;
  error: string | undefined;
}

/** Writes items of one collection; a refused value shows as `error` instead of throwing. */
export function useSaver(collection: string): Saver {
  const { local } = useCave();
  const [error, setError] = useState<string>();
  const save = async (id: string, patch: Record<string, unknown>) => {
    try {
      await local.write({ id, kind: "item", collection }, patch);
      setError(undefined);
      return true;
    } catch (e) {
      if (!(e instanceof FieldValueError)) throw e;
      setError(e.message);
      return false;
    }
  };
  return {
    save,
    async create(patch) {
      const id = newId();
      return (await save(id, patch)) ? id : undefined;
    },
    error,
  };
}
