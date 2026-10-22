import { localDate } from "../../shared/dates.ts";
import { dueInstant, isOpen, type Zone } from "../../shared/reminders.ts";
import type { Doc } from "../../shared/types.ts";
import type { Store } from "../store.ts";

type DueGroup = "Overdue" | "Today" | "Tomorrow";

interface DueEntry {
  group: DueGroup;
  doc: Doc;
  collection: "reminders" | "tasks";
  /** Local `YYYY-MM-DD[THH:mm]`. */
  due: string;
}

const CLOSED_TASKS = new Set(["done", "dropped"]);
const dayAfter = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** What the Due card shows: open reminders and tasks, overdue first, then today and tomorrow. */
export function dueList(store: Store, zone: Zone, now: number): DueEntry[] {
  const today = localDate(new Date(now), zone.timeZone);
  const tomorrow = dayAfter(today);
  const entries: (DueEntry & { at: number })[] = [];
  for (const doc of store.itemsOf("reminders")) {
    const due = doc.data.due;
    const at = dueInstant(due, zone);
    if (!isOpen(doc) || typeof due !== "string" || at === undefined) continue;
    const day = due.slice(0, 10);
    const group: DueGroup | undefined =
      at <= now ? "Overdue" : day === today ? "Today" : day === tomorrow ? "Tomorrow" : undefined;
    if (group) entries.push({ group, doc, collection: "reminders", due, at });
  }
  for (const doc of store.itemsOf("tasks")) {
    const due = typeof doc.data.due === "string" ? doc.data.due.slice(0, 10) : undefined;
    if (!due || CLOSED_TASKS.has(String(doc.data.status)) || doc.data._deleted === true) continue;
    const group: DueGroup | undefined =
      due < today ? "Overdue" : due === today ? "Today" : due === tomorrow ? "Tomorrow" : undefined;
    if (group)
      entries.push({ group, doc, collection: "tasks", due, at: dueInstant(due, zone) ?? 0 });
  }
  const order: DueGroup[] = ["Overdue", "Today", "Tomorrow"];
  return entries
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.at - b.at)
    .map(({ at: _, ...entry }) => entry);
}
