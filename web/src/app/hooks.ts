import { useEffect, useMemo, useState } from "react";
import { localDate } from "../../../shared/dates.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { newId } from "../../../shared/ids.ts";
import { type Zone, zoneOf } from "../../../shared/reminders.ts";
import { pick, shown } from "../logic/follow.ts";
import { useDoc } from "../store/queries.ts";
import { watchClock } from "./clock.ts";
import { useCave } from "./context.ts";

export function useTimeZone(): string | undefined {
  const settings = useDoc(useCave().local.db, "settings");
  const tz = settings?.data.timezone;
  return typeof tz === "string" ? tz : undefined;
}

/**
 * The current time, re-read every minute and whenever the page comes back, so "overdue" and
 * midnight roll over on their own, also after the phone resumes the app.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => watchClock({ window, document }, () => setNow(new Date())), []);
  return now;
}

/** A value that follows `current` (today, this month) until the owner picks another. */
export function useFollowing(current: string): [string, (value: string) => void] {
  const [picked, setPicked] = useState<string>();
  return [shown(picked, current), (value) => setPicked(pick(value, current))];
}

/** Today's local date in the settings timezone. */
export function useToday(): string {
  return localDate(useNow(), useTimeZone());
}

/** The settings timezone and reminder time, which every reminder rule reads. */
export function useReminderZone(): Zone {
  const settings = useDoc(useCave().local.db, "settings");
  const { timeZone, defaultTime } = zoneOf(
    settings?.data,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
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
