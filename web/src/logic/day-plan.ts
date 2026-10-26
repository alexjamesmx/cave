import type { RoutineBlock } from "../../../shared/routine.ts";
import type { CalendarEvent } from "./calendar.ts";

export type PlanEntry =
  | { kind: "event"; key: string; event: CalendarEvent }
  | { kind: "block"; key: string; block: RoutineBlock };

const rank = (time: string | undefined, allDay: boolean) =>
  allDay ? -1 : time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : 24 * 60;

/**
 * One day as one list: the owner's routine blocks and the day's reminders, tasks and payments.
 * All-day entries first, then everything with a time in time order (a block before an event
 * at the same minute), then the blocks with no set time.
 */
export function dayPlan(blocks: RoutineBlock[], events: CalendarEvent[]): PlanEntry[] {
  const entries = [
    ...events.map((event) => ({
      entry: { kind: "event" as const, key: event.key, event },
      at: rank(event.time, event.time === undefined),
      order: 1,
    })),
    ...blocks.map((block) => ({
      entry: { kind: "block" as const, key: `block-${block.id}`, block },
      at: rank(block.start, false),
      order: 0,
    })),
  ];
  return entries.sort((a, b) => a.at - b.at || a.order - b.order).map((e) => e.entry);
}
