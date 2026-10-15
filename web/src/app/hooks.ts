import { useEffect, useMemo, useState } from "react";
import { localDate } from "../../../shared/dates.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { DEFAULT_REMINDER_TIME, type Zone } from "../../../shared/reminders.ts";
import { useDoc } from "../store/queries.ts";
import { useCave } from "./context.ts";

export function useTimeZone(): string | undefined {
  const settings = useDoc(useCave().local.db, "settings");
  const tz = settings?.data.timezone;
  return typeof tz === "string" ? tz : undefined;
}

/** The current time, re-read every minute so "overdue" and midnight roll over on their own. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Today's local date in the settings timezone. */
export function useToday(): string {
  return localDate(useNow(), useTimeZone());
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The settings timezone and reminder time, which every reminder rule reads. */
export function useReminderZone(): Zone {
  const settings = useDoc(useCave().local.db, "settings");
  const tz = settings?.data.timezone;
  const time = settings?.data.reminderTime;
  const timeZone = typeof tz === "string" ? tz : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultTime = typeof time === "string" && TIME_RE.test(time) ? time : DEFAULT_REMINDER_TIME;
  return useMemo(() => ({ timeZone, defaultTime }), [timeZone, defaultTime]);
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
