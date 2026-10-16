import { advance, type ReminderLike, type Zone } from "./recurrence.ts";

/**
 * The field changes that complete a task. A repeating one moves to its next date and stays
 * open, so the same task comes back; `completed` records when it was last done, and the
 * change log keeps every completion. One that doesn't repeat is done.
 */
export function completeTask(
  t: ReminderLike,
  now: number,
  zone: Zone,
  nowLocal: string,
): Record<string, unknown> {
  const next = advance(t, now, zone);
  if (!next) return { status: "done", completed: nowLocal };
  return {
    ...next,
    completed: nowLocal,
    ...(t.data.status === "done" || t.data.status === "dropped" ? { status: "todo" } : {}),
  };
}
