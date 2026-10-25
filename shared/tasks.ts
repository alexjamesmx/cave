import { advance, type ReminderLike, type Zone } from "./recurrence.ts";
import type { CollectionData } from "./schema.ts";
import type { Doc } from "./types.ts";

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
  // The next occurrence starts fresh: whatever column this one was done from, it comes back todo.
  return {
    ...next,
    completed: nowLocal,
    ...(t.data.status !== undefined && t.data.status !== "todo" ? { status: "todo" } : {}),
  };
}

/**
 * Seed migration 21 (M12 part 9): Tasks → Calendar retires, since Calendar → Month already shows
 * every task with a due date. Only the seed's own view (id `calendar`) goes; an owner's views,
 * calendar ones included, stay.
 */
export function tasksCalendarMigration(
  get: (id: string) => Doc | undefined,
): { id: string; kind: "collection"; data: Record<string, unknown> }[] {
  const tasks = get("tasks");
  if (tasks?.kind !== "collection" || tasks.data._deleted === true) return [];
  const views = (tasks.data as unknown as CollectionData).views;
  if (!Array.isArray(views) || !views.some((v) => v.id === "calendar")) return [];
  return [
    { id: "tasks", kind: "collection", data: { views: views.filter((v) => v.id !== "calendar") } },
  ];
}
