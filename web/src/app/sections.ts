/**
 * The one registry of where things live (M8 part 1, six sections since M11). The rail, the
 * dock, More and the router read it; collections never appear in navigation on their own, each
 * lives in the section that owns it. Adding a section or a tab is one entry here.
 */

/** A tab shows one view of a collection, or one page; `description` is one line for someone new. */
export type Tab = (
  | {
      id: string;
      label: string;
      kind: "view";
      collection: string;
      view?: string;
      hidden?: boolean;
    }
  | { id: string; label: string; kind: "page"; page: PageId; hidden?: boolean }
) & { description?: string };

export type PageId =
  | "calendar-month"
  | "calendar-agenda"
  | "review"
  | "money-transactions"
  | "projects-all"
  | "projects-ideas"
  | "notes"
  | "radar"
  | "project"
  | "activity"
  | "agents"
  | "flows"
  | "settings-general"
  | "settings-lists"
  | "settings-notifications"
  | "settings-devices"
  | "settings-data"
  | "settings-system";

export interface Section {
  id: string;
  label: string;
  icon: string;
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
    color: "var(--ok)",
    path: "/money",
    tabs: [
      {
        ...view("overview", "Overview", "money", "dashboard"),
        description: "Where your money went this month.",
      },
      {
        ...page("transactions", "Transactions", "money-transactions"),
        description: "Money that moved. Every expense, income and transfer.",
      },
      {
        ...view("payments", "Payments", "payments", "upcoming"),
        description:
          "What's coming due. Marking one paid logs the transaction and moves it to its next date.",
      },
      {
        ...view("net-worth", "Net worth", "wealth"),
        description: "What you own minus what you owe.",
      },
      // Not a tab: Transactions links to it when the review has work.
      page("review", "Review", "review", true),
    ],
    owns: ["money", "payments", "wealth"],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "calendar-days",
    color: "var(--bad)",
    path: "/calendar",
    tabs: [
      page("month", "Month", "calendar-month"),
      page("agenda", "Agenda", "calendar-agenda"),
      view("reminders", "Reminders", "reminders", "table"),
    ],
    owns: ["reminders"],
  },
  {
    id: "flows",
    label: "Flows",
    icon: "workflow",
    color: "var(--warn)",
    path: "/flows",
    // One flow's page is `/flows/<id>`: anything after Flows that is not a tab is a flow.
    tabs: [page("list", "List", "flows")],
    owns: ["flows"],
  },
  {
    id: "projects",
    label: "Projects",
    icon: "rocket",
    color: "var(--vio)",
    path: "/projects",
    tabs: [
      page("all", "All", "projects-all"),
      page("ideas", "Ideas", "projects-ideas"),
      page("radar", "Radar", "radar"),
      page("notes", "Notes", "notes"),
      page("activity", "Activity", "activity"),
      // One project's page, at `/projects/<id>/<tab>`; pinned ones also show as tabs.
      page("project", "Project", "project", true),
    ],
    owns: ["projects", "ideas", "radar", "notes", "leetcode", "parts"],
  },
  {
    id: "diary",
    label: "Diary",
    icon: "notebook",
    color: "var(--wait)",
    path: "/diary",
    tabs: [
      view("write", "Write", "journal", "write"),
      view("habits", "Habits", "journal", "habits"),
    ],
    owns: ["journal"],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "square-check",
    color: "var(--teal)",
    path: "/tasks",
    tabs: [
      view("board", "Board", "tasks", "board"),
      view("list", "List", "tasks", "table"),
      view("calendar", "Calendar", "tasks", "calendar"),
    ],
    owns: ["tasks"],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    color: "#6b7380",
    path: "/settings",
    tabs: [
      page("general", "General", "settings-general"),
      page("lists", "Lists", "settings-lists"),
      page("notifications", "Notifications", "settings-notifications"),
      page("devices", "Devices", "settings-devices"),
      page("data", "Data", "settings-data"),
      page("system", "System", "settings-system"),
      page("agents", "Agents", "agents"),
    ],
    owns: [],
  },
];

/** Where the app opens: Projects, until the Scene (M11 part 5) takes its place. */
export const LANDING = "/projects/all";

/** Collections with no section: reached only from Settings → Data. */
export const DATA_ONLY = ["proposals", "runs"];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);

/** The section a collection lives in, if any. */
export const ownerOf = (collection: string) => SECTIONS.find((s) => s.owns.includes(collection));

export const tabPath = (section: Section, tab: Tab) => `${section.path}/${tab.id}`;

/** Tabs shown in a section's tab bar. */
export const visibleTabs = (section: Section) => section.tabs.filter((t) => !t.hidden);

export const DOCK_SIZE = 4;
export const DEFAULT_DOCK = ["projects", "money", "tasks", "calendar"];

/** Dock ids from before M8, the AI section (gone in M10), Home and Life (gone in M11). */
const OLD_DOCK: Record<string, string> = {
  payments: "money",
  wealth: "money",
  reminders: "calendar",
  leetcode: "projects",
  ideas: "projects",
  diary: "diary",
  life: "diary",
  home: "projects",
  agents: "settings",
  ai: "settings",
  system: "settings",
};

/**
 * `settings.dock` as synced: four section ids, old ones mapped to their section. Duplicates
 * collapse; anything short of four distinct sections falls back to the default.
 */
export function dockOf(settings: Record<string, unknown> | undefined): Section[] {
  const raw = settings?.dock;
  const ids = Array.isArray(raw)
    ? [...new Set(raw.map((id) => OLD_DOCK[String(id)] ?? String(id)))].filter((id) =>
        SECTIONS.some((s) => s.id === id),
      )
    : [];
  const chosen = ids.length === DOCK_SIZE ? ids : DEFAULT_DOCK;
  return chosen.map((id) => sectionById(id) as Section);
}

/** Which section a path belongs to, for marking the active one; `/` is where the app opens. */
export function sectionOf(pathname: string): string | undefined {
  const first = pathname === "/" ? LANDING.split("/")[1] : pathname.split("/")[1];
  return SECTIONS.find((s) => s.id === first)?.id;
}
