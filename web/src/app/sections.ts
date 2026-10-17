/**
 * The one registry of where things live (M8 part 1). The sidebar, the dock, More and the
 * router read it; collections never appear in navigation on their own, each lives in the
 * section that owns it. Adding a section or a tab is one entry here.
 */

/** A tab shows one view of a collection, or one page. */
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
  | "home"
  | "calendar-month"
  | "calendar-agenda"
  | "review"
  | "projects-all"
  | "projects-ideas"
  | "project"
  | "agents"
  | "flows"
  | "ai-overview"
  | "ai-setup"
  | "ai-activity"
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
  /** `/` for Home, else `/<id>`. */
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
    id: "home",
    label: "Home",
    icon: "house",
    color: "var(--lime)",
    path: "/",
    tabs: [page("home", "Home", "home")],
    owns: [],
  },
  {
    id: "money",
    label: "Money",
    icon: "wallet",
    color: "var(--income)",
    path: "/money",
    tabs: [
      view("overview", "Overview", "money", "dashboard"),
      view("transactions", "Transactions", "money", "table"),
      view("payments", "Payments", "payments", "upcoming"),
      view("wealth", "Wealth", "wealth"),
      page("review", "Review categories", "review", true),
    ],
    owns: ["money", "payments", "wealth"],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "calendar-days",
    color: "var(--expense)",
    path: "/calendar",
    tabs: [
      page("month", "Month", "calendar-month"),
      page("agenda", "Agenda", "calendar-agenda"),
      view("reminders", "Reminders", "reminders", "table"),
    ],
    owns: ["reminders"],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "square-check",
    color: "var(--cyan)",
    path: "/tasks",
    tabs: [
      view("board", "Board", "tasks", "board"),
      view("list", "List", "tasks", "table"),
      view("calendar", "Calendar", "tasks", "calendar"),
    ],
    owns: ["tasks"],
  },
  {
    id: "projects",
    label: "Projects",
    icon: "rocket",
    color: "var(--purple)",
    path: "/projects",
    tabs: [
      page("all", "All", "projects-all"),
      page("ideas", "Ideas", "projects-ideas"),
      // One project's page, at `/projects/<id>/<tab>`; pinned ones also show as tabs.
      page("project", "Project", "project", true),
    ],
    owns: ["projects", "ideas", "leetcode", "parts"],
  },
  {
    id: "life",
    label: "Life",
    icon: "notebook",
    color: "var(--violet)",
    path: "/life",
    tabs: [
      view("diary", "Diary", "journal", "write"),
      view("habits", "Habits", "journal", "habits"),
    ],
    owns: ["journal"],
  },
  {
    id: "ai",
    label: "AI",
    icon: "sparkles",
    color: "var(--purple)",
    path: "/ai",
    tabs: [
      page("overview", "Overview", "ai-overview"),
      page("agents", "Agents", "agents"),
      page("flows", "Flows", "flows"),
      page("setup", "Setup", "ai-setup"),
      page("activity", "Activity", "ai-activity"),
    ],
    owns: ["flows", "ai"],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    color: "var(--muted)",
    path: "/settings",
    tabs: [
      page("general", "General", "settings-general"),
      page("lists", "Lists", "settings-lists"),
      page("notifications", "Notifications", "settings-notifications"),
      page("devices", "Devices", "settings-devices"),
      page("data", "Data", "settings-data"),
      page("system", "System", "settings-system"),
    ],
    owns: [],
  },
];

/** Collections with no section: reached only from Settings → Data. */
export const DATA_ONLY = ["proposals"];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);

/** The section a collection lives in, if any. */
export const ownerOf = (collection: string) => SECTIONS.find((s) => s.owns.includes(collection));

export const tabPath = (section: Section, tab: Tab) =>
  section.id === "home" ? "/" : `${section.path}/${tab.id}`;

/** Tabs shown in a section's tab bar. */
export const visibleTabs = (section: Section) => section.tabs.filter((t) => !t.hidden);

export const DOCK_SIZE = 4;
export const DEFAULT_DOCK = ["home", "money", "tasks", "calendar"];

/** Dock ids from before M8, and the section each now lives in. */
const OLD_DOCK: Record<string, string> = {
  payments: "money",
  wealth: "money",
  reminders: "calendar",
  leetcode: "projects",
  ideas: "projects",
  diary: "life",
  agents: "ai",
  flows: "ai",
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

/** Which section a path belongs to, for marking the active one. */
export function sectionOf(pathname: string): string | undefined {
  if (pathname === "/") return "home";
  const first = pathname.split("/")[1];
  return SECTIONS.find((s) => s.id !== "home" && s.id === first)?.id;
}
