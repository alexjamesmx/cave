import { parseDefinition } from "../../../shared/flows/registry.ts";
import { nextSlot } from "../../../shared/flows/schedule.ts";
import { parseStamp } from "../../../shared/hlc.ts";
import type { Zone } from "../../../shared/reminders.ts";
import type { Doc } from "../../../shared/types.ts";
import { reminderSource } from "./calendar.ts";
import { titleOf } from "./views.ts";

export const SCHEDULE_DAYS = 7;

interface CollectionStat {
  collection: string;
  count: number;
  /** The newest stamp on any of its items: when it last changed, on any device. */
  lastChange: number | undefined;
}

/** Live items per collection and when each last changed, from this device's copy. */
export function collectionStats(items: Doc[]): Map<string, CollectionStat> {
  const stats = new Map<string, CollectionStat>();
  for (const doc of items) {
    if (doc.kind !== "item" || !doc.collection || doc.data._deleted === true) continue;
    const stat = stats.get(doc.collection) ?? {
      collection: doc.collection,
      count: 0,
      lastChange: undefined,
    };
    stat.count += 1;
    for (const stamp of Object.values(doc.stamps)) {
      const ms = parseStamp(stamp).ms;
      if (stat.lastChange === undefined || ms > stat.lastChange) stat.lastChange = ms;
    }
    stats.set(doc.collection, stat);
  }
  return stats;
}

interface ScheduleEntry {
  key: string;
  at: number;
  kind: "reminder" | "flow" | "job" | "deploy";
  label: string;
  path: string;
  /** Known only roughly: the deploy timer runs on the VPS, outside the server. */
  approximate?: boolean;
}

interface JobTimes {
  id: string;
  label: string;
  nextRun: number;
}

/** Reminder notifications due in the window: open reminders and their repeats. */
export function reminderEntries(docs: Doc[], zone: Zone, now: number, to: number): ScheduleEntry[] {
  return reminderSource(docs, zone, now)
    .events({ from: now, to })
    .filter((e) => !e.done)
    .map((e) => ({
      key: `reminder:${e.key}`,
      at: e.at,
      kind: "reminder",
      label: e.title,
      path: `/r/${encodeURIComponent(e.itemId)}`,
    }));
}

/** Every slot of each scheduled flow that is on, in the window. */
export function flowEntries(docs: Doc[], zone: Zone, now: number, to: number): ScheduleEntry[] {
  const found: ScheduleEntry[] = [];
  for (const doc of docs) {
    if (doc.data._deleted === true || doc.data.status !== "on") continue;
    const parsed = parseDefinition(doc.data.definition);
    if (!parsed.ok || parsed.value.trigger.type !== "schedule") continue;
    let at = nextSlot(parsed.value.trigger, now - 1, zone.timeZone);
    while (at !== undefined && at < to) {
      found.push({
        key: `flow:${doc.id}:${at}`,
        at,
        kind: "flow",
        label: titleOf(doc),
        path: `/flows/${encodeURIComponent(doc.id)}`,
      });
      at = nextSlot(parsed.value.trigger, at, zone.timeZone);
    }
  }
  return found;
}

/** Each job's next run (a past one is due now) and the deploy timer's approximate check. */
export function jobEntries(
  jobs: JobTimes[],
  deployNextAt: number | null,
  now: number,
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = jobs.map((j) => ({
    key: `job:${j.id}`,
    at: Math.max(j.nextRun, now),
    kind: "job",
    label: j.label,
    path: "/settings/system/jobs",
  }));
  if (deployNextAt !== null)
    entries.push({
      key: "deploy",
      at: Math.max(deployNextAt, now),
      kind: "deploy",
      label: "Deploy check",
      path: "/settings/system/jobs",
      approximate: true,
    });
  return entries;
}

/** One list in time order; entries at the same moment keep a stable order by key. */
export function mergeSchedule(...lists: ScheduleEntry[][]): ScheduleEntry[] {
  return lists.flat().sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}
