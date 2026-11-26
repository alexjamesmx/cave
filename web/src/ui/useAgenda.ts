import { useMemo } from "react";
import { useCave } from "../app/context.ts";
import { useNow, useReminderZone } from "../app/hooks.ts";
import { agenda, agendaDone } from "../logic/agenda.ts";
import { useItems } from "../store/queries.ts";

/**
 * The agenda now, open groups and the done list, from the local copy; undefined while it
 * loads. Month's Upcoming and the Agenda tab read this one, so they always agree.
 */
export function useAgenda() {
  const { db } = useCave().local;
  const reminders = useItems(db, "reminders");
  const tasks = useItems(db, "tasks");
  const zone = useReminderZone();
  const now = useNow().getTime();
  return useMemo(
    () =>
      reminders && tasks
        ? {
            groups: agenda(reminders, tasks, now, zone),
            done: agendaDone(reminders, tasks, zone),
          }
        : undefined,
    [reminders, tasks, now, zone],
  );
}
