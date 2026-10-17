import { useSyncExternalStore } from "react";
import { ownerOf, sectionById, type Tab, tabPath } from "./sections.ts";

export type Route =
  /** A section's tab; `rest` is what follows it (a flow id, a collection in Data, a sub-tab). */
  | { name: "section"; section: string; tab: string; rest: string[] }
  /** A reminder opened from a notification; `?do=done|snooze60` acts on it once. */
  | { name: "reminder"; id: string }
  /** An old path: the app replaces it with its new home. */
  | { name: "redirect"; to: string }
  | { name: "not-found" };

const parts = (pathname: string) => pathname.split("/").filter(Boolean).map(decodeURIComponent);
const enc = (...segments: string[]) => `/${segments.map(encodeURIComponent).join("/")}`;

/**
 * Where an old path (before M8's sections) lives now; `undefined` when it is current. Every
 * collection goes to the tab that shows it, else to Settings → Data.
 */
export function redirectOf(pathname: string): string | undefined {
  const p = parts(pathname);
  const [first, second, third] = p;
  if (first === "agents" && p.length === 1) return "/ai/agents";
  if (first === "flows") return second ? enc("ai", "flows", second) : "/ai/flows";
  if (first === "ai" && p.length === 1) return "/ai/setup";
  if (first === "system") return second ? enc("settings", "system", second) : "/settings/system";
  // Wealth is Net worth since M7c.
  if (first === "money" && second === "wealth") return "/money/net-worth";
  if (first !== "c" || !second) return undefined;
  const collection = second;
  const view = third;
  // LeetCode is a project now (M8 part 2): its items live on that project's Items tab.
  if (collection === "leetcode") return "/projects/proj-leetcode/items";
  const owner = ownerOf(collection);
  const tabs = owner?.tabs.filter((t) => t.kind === "view" && t.collection === collection) ?? [];
  const tab = view
    ? tabs.find((t) => t.kind === "view" && t.view === view)
    : (tabs.find((t) => t.kind === "view" && t.view === undefined) ?? tabs[0]);
  if (owner && tab) return tabPath(owner, tab);
  if (collection === "money" && view === "table") return "/money/transactions";
  if (collection === "projects") return "/projects";
  if (collection === "ideas") return "/projects/ideas";
  if (collection === "flows") return "/ai/flows";
  if (collection === "ai") return "/ai/setup";
  return view ? enc("settings", "data", collection, view) : enc("settings", "data", collection);
}

export function parseRoute(pathname: string): Route {
  const redirect = redirectOf(pathname);
  if (redirect) return { name: "redirect", to: redirect };
  const p = parts(pathname);
  if (p.length === 0) return { name: "section", section: "home", tab: "home", rest: [] };
  if (p[0] === "r" && p[1] && p.length === 2) return { name: "reminder", id: p[1] };
  const section = sectionById(p[0] as string);
  if (!section || section.id === "home") return { name: "not-found" };
  // `/projects/<id>/<tab>`: anything after Projects that is not a tab is a project.
  if (section.id === "projects" && p[1] && !section.tabs.some((t) => t.id === p[1]))
    return { name: "section", section: "projects", tab: "project", rest: p.slice(1) };
  // An unknown tab falls back to the section's first.
  const tab = section.tabs.find((t) => t.id === p[1]) ?? (section.tabs[0] as Tab);
  const rest = section.tabs.some((t) => t.id === p[1]) ? p.slice(2) : [];
  return { name: "section", section: section.id, tab: tab.id, rest };
}

/** Where a collection (and one of its views) lives now. */
export const collectionPath = (collection: string, view?: string) => {
  const old = `/c/${encodeURIComponent(collection)}${view ? `/${encodeURIComponent(view)}` : ""}`;
  return redirectOf(old) ?? old;
};

export const projectPath = (id: string, tab?: string) =>
  tab ? enc("projects", id, tab) : enc("projects", id);

export const flowPath = (id?: string) => (id ? enc("ai", "flows", id) : "/ai/flows");

// pushState fires no event, so navigation announces itself for subscribers.
const NAVIGATE = "cave:navigate";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(NAVIGATE, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(NAVIGATE, listener);
  };
}

/** Goes to `path`, which may carry a query string. */
export function navigate(path: string): void {
  if (path === location.pathname + location.search) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATE));
}

export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);

/** The query string (`?a=1`), for state a view keeps in the URL so it can be bookmarked. */
export const useSearch = () => useSyncExternalStore(subscribe, () => location.search);

/** Swaps the current entry for `path` (a redirect), keeping the query string. */
export function replacePath(path: string): void {
  history.replaceState(null, "", path + location.search);
  window.dispatchEvent(new Event(NAVIGATE));
}

/** Replaces the query string without a new history entry (filters change as you type). */
export function setSearch(search: string): void {
  if (search === location.search) return;
  history.replaceState(null, "", location.pathname + search);
  window.dispatchEvent(new Event(NAVIGATE));
}

// Single-letter shortcuts, ignored while typing or with a modifier held.
const SHORTCUTS: Record<string, string> = { c: "/calendar/month" };

export function isTyping(target: EventTarget | null): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function shortcutPath(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "target">,
): string | undefined {
  if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return undefined;
  return SHORTCUTS[event.key.toLowerCase()];
}

export function listenForShortcuts(root: Document): void {
  root.addEventListener("keydown", (event) => {
    const path = shortcutPath(event);
    if (!path || event.defaultPrevented) return;
    event.preventDefault();
    navigate(path);
  });
}

/**
 * Plain left clicks on same-origin links navigate without a reload, so pages use ordinary
 * `<a href>` elements. Modified clicks, other targets and `/api` links keep browser behaviour.
 */
export function interceptLinks(root: Document): void {
  root.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download"))
      return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  });
}
