/** Every place the phone's dock and More sheet can open; the desktop sidebar lists its own. */
export interface Section {
  id: string;
  label: string;
  icon: string;
  color: string;
  path: string;
}

export const SECTIONS: Section[] = [
  { id: "home", label: "Home", icon: "house", color: "var(--lime)", path: "/" },
  { id: "money", label: "Money", icon: "wallet", color: "var(--income)", path: "/c/money" },
  { id: "tasks", label: "Tasks", icon: "square-check", color: "var(--cyan)", path: "/c/tasks" },
  {
    id: "payments",
    label: "Payments",
    icon: "calendar-clock",
    color: "var(--orange)",
    path: "/c/payments",
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "calendar-days",
    color: "var(--expense)",
    path: "/calendar",
  },
  {
    id: "reminders",
    label: "Reminders",
    icon: "bell",
    color: "var(--expense)",
    path: "/c/reminders",
  },
  { id: "flows", label: "Flows", icon: "workflow", color: "var(--violet)", path: "/flows" },
  { id: "ai", label: "AI", icon: "sparkles", color: "var(--purple)", path: "/settings#ai" },
  { id: "system", label: "System", icon: "activity", color: "var(--cyan)", path: "/system" },
  { id: "diary", label: "Diary", icon: "notebook", color: "var(--violet)", path: "/c/journal" },
  { id: "ideas", label: "Ideas", icon: "lightbulb", color: "var(--lime)", path: "/c/ideas" },
  { id: "leetcode", label: "LeetCode", icon: "code", color: "var(--orange)", path: "/c/leetcode" },
  { id: "wealth", label: "Wealth", icon: "trending-up", color: "var(--gold)", path: "/c/wealth" },
  {
    id: "projects",
    label: "Projects",
    icon: "rocket",
    color: "var(--purple)",
    path: "/c/projects",
  },
  { id: "agents", label: "Agents", icon: "bot", color: "var(--muted)", path: "/agents" },
  { id: "settings", label: "Settings", icon: "settings", color: "var(--muted)", path: "/settings" },
];

export const DOCK_SIZE = 4;
export const DEFAULT_DOCK = ["home", "money", "tasks", "calendar"];

/**
 * `settings.dock` as synced: four distinct known sections, else the default. Settings docs
 * aren't shape-checked, so anything else falls back.
 */
export function dockOf(settings: Record<string, unknown> | undefined): Section[] {
  const raw = settings?.dock;
  const ids =
    Array.isArray(raw) &&
    raw.length === DOCK_SIZE &&
    new Set(raw).size === DOCK_SIZE &&
    raw.every((id) => SECTIONS.some((s) => s.id === id))
      ? (raw as string[])
      : DEFAULT_DOCK;
  return ids.map((id) => SECTIONS.find((s) => s.id === id) as Section);
}

/** Which section a path belongs to, for marking the active one; a fragment never matches. */
export function sectionOf(pathname: string): string | undefined {
  const match = SECTIONS.filter((s) => !s.path.includes("#"))
    .filter((s) =>
      s.path === "/" ? pathname === "/" : pathname === s.path || pathname.startsWith(`${s.path}/`),
    )
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match?.id;
}
