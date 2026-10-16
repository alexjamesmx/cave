import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "collection"; collection: string; view: string | undefined }
  | { name: "calendar" }
  /** `/flows`, or one flow; `?do=approve|reject` from a notification asks to confirm. */
  | { name: "flows"; id: string | undefined }
  /** A reminder opened from a notification; `?do=done|snooze60` acts on it once. */
  | { name: "reminder"; id: string }
  | { name: "settings" }
  /** The money category review (M7b part 5). */
  | { name: "review" }
  /** `/system`, or one of its tabs: `/system/jobs`. */
  | { name: "system"; tab: string | undefined }
  | { name: "agents" }
  | { name: "not-found" };

const COLLECTION_RE = /^\/c\/([^/]+)(?:\/([^/]+))?\/?$/;

export function parseRoute(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { name: "home" };
  if (pathname === "/calendar") return { name: "calendar" };
  const flows = /^\/flows(?:\/([^/]+))?\/?$/.exec(pathname);
  if (flows)
    return { name: "flows", id: flows[1] === undefined ? undefined : decodeURIComponent(flows[1]) };
  const reminder = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (reminder) return { name: "reminder", id: decodeURIComponent(reminder[1] as string) };
  if (pathname === "/settings") return { name: "settings" };
  if (pathname === "/money/review") return { name: "review" };
  const system = /^\/system(?:\/([a-z]+))?\/?$/.exec(pathname);
  if (system) return { name: "system", tab: system[1] };
  if (pathname === "/agents") return { name: "agents" };
  const m = COLLECTION_RE.exec(pathname);
  if (m) {
    const view = m[2] === undefined ? undefined : decodeURIComponent(m[2]);
    return { name: "collection", collection: decodeURIComponent(m[1] as string), view };
  }
  return { name: "not-found" };
}

export const collectionPath = (collection: string, view?: string) =>
  `/c/${encodeURIComponent(collection)}${view ? `/${encodeURIComponent(view)}` : ""}`;

export const flowPath = (id?: string) => (id ? `/flows/${encodeURIComponent(id)}` : "/flows");

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

export function navigate(path: string): void {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATE));
}

export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);

// Single-letter shortcuts, ignored while typing or with a modifier held.
const SHORTCUTS: Record<string, string> = { c: "/calendar" };

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
    navigate(url.pathname);
  });
}
