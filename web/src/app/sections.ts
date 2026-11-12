/**
 * The one registry of where things live (M8 part 1, six sections since M11). The rail, the
 * dock, More and the router read it; collections never appear in navigation on their own, each
 * lives in the section that owns it. Adding a section or a tab is one entry here.
 */

/** A tab shows one view of a collection, or one page. Tabs carry no descriptions (M14). */
export type Tab =
  | {
      id: string;
      label: string;
      kind: "view";
      collection: string;
      view?: string;
      hidden?: boolean;
    }
  | { id: string; label: string; kind: "page"; page: PageId; hidden?: boolean };

export type PageId =
  | "calendar-month"
  | "calendar-agenda"
  | "calendar-routine"
  | "money-transactions"
  | "ideas"
  | "notes"
  | "tasks-list"
  | "diary-today"
  | "diary-days"
  | "flows"
  | "flows-runs"
  | "money-lists"
  | "money-subscriptions"
  | "settings-general"
  | "settings-devices"
  | "settings-notifications"
  | "settings-agents"
  | "settings-data";

export interface Section {
  id: string;
  label: string;
  /** Lucide name, where an emoji can't go (a select, a flow step). */
  icon: string;
  /** What the sidebar, the dock and the page header show (M14). */
  emoji: string;
  /** The section's own colour, a hex so tints can be mixed from it. */
  color: string;
  /** `/<id>`. */
  path: string;
  tabs: Tab[];
  /** Collections this section is home to; every other collection is Data-only. */
  owns: string[];
}

const view = (id: string, label: string, collection: string, v?: string): Tab =>
  v === undefined
    ? { id, label, kind: "view", collection }
    : { id, label, kind: "view", collection, view: v };
const page = (id: string, label: string, p: PageId, hidden?: boolean): Tab =>
  hidden ? { id, label, kind: "page", page: p, hidden } : { id, label, kind: "page", page: p };

export const SECTIONS: Section[] = [
  {
    id: "money",
    label: "Money",
    icon: "wallet",
    emoji: "💸",
    color: "#34d399",
    path: "/money",
    tabs: [
      view("overview", "Overview", "money", "dashboard"),
      page("transactions", "Transactions", "money-transactions"),
      page("subscriptions", "Subscriptions", "money-subscriptions"),
      view("net-worth", "Net worth", "wealth"),
      page("lists", "Categories", "money-lists"),
    ],
    owns: ["money", "payments", "wealth"],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "square-check",
    emoji: "✅",
    color: "#60a5fa",
    path: "/tasks",
    tabs: [view("board", "Board", "tasks", "board"), page("list", "List", "tasks-list")],
    owns: ["tasks"],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "calendar-days",
    emoji: "📅",
    color: "#fb7185",
    path: "/calendar",
    // Agenda is everything with a date (M14); it was Reminders, reminders only.
    tabs: [
      page("month", "Month", "calendar-month"),
      page("agenda", "Agenda", "calendar-agenda"),
      page("routine", "Routine", "calendar-routine"),
    ],
    owns: ["reminders"],
  },
  {
    // Anything written down, the diary's Today and Days, and LeetCode (M14): Ideas are notes.
    id: "notes",
    label: "Notes",
    icon: "notebook-pen",
    emoji: "📝",
    color: "#a78bfa",
    path: "/notes",
    tabs: [
      page("all", "Notes", "notes"),
      page("write", "Today", "diary-today"),
      page("days", "Days", "diary-days"),
      view("leetcode", "LeetCode", "leetcode"),
      page("ideas", "Ideas", "ideas", true),
    ],
    owns: ["notes", "journal", "leetcode", "ideas"],
  },
  {
    id: "flows",
    label: "Flows",
    icon: "workflow",
    emoji: "⚡",
    color: "#fbbf24",
    path: "/flows",
    // `/flows/<id>`: anything after Flows that is not a tab is a flow, open in the inspector
    // beside the canvas; `/flows/jobs/<id>` is a built-in job there (M12 part 4).
    tabs: [page("canvas", "Flows", "flows"), page("runs", "Runs", "flows-runs")],
    owns: ["flows"],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    emoji: "⚙️",
    color: "#8b93a1",
    path: "/settings",
    // Only general things live here (M11 part 3); each section edits its own lists.
    tabs: [
      page("general", "General", "settings-general"),
      page("devices", "Devices & server", "settings-devices"),
      page("notifications", "Notifications", "settings-notifications"),
      page("agents", "Agents", "settings-agents"),
      page("data", "Data", "settings-data"),
    ],
    owns: [],
  },
];

/** Where the app opens: Money's overview (the Scene went with Projects on 2026-11-08). */
export const LANDING = "/money/overview";

/** Collections with no section: reached only from Settings → Data. */
export const DATA_ONLY = ["proposals", "radar"];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);

/** The section a collection lives in, if any. */
export const ownerOf = (collection: string) => SECTIONS.find((s) => s.owns.includes(collection));

export const tabPath = (section: Section, tab: Tab) => `${section.path}/${tab.id}`;

/** Tabs shown in a section's tab bar. */
export const visibleTabs = (section: Section) => section.tabs.filter((t) => !t.hidden);

/** The phone dock (M14): the four sections used every day, the same on every phone. */
export const DOCK = ["money", "tasks", "calendar", "notes"].map((id) => sectionById(id) as Section);

/** Which section a path belongs to, for marking the active one; `/` is where the app opens. */
export function sectionOf(pathname: string): string | undefined {
  const first = pathname === "/" ? LANDING.split("/")[1] : pathname.split("/")[1];
  return SECTIONS.find((s) => s.id === first)?.id;
}
