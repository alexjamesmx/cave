import { isShellRequest } from "./sw-policy.ts";
import { clickTarget, fromPush, type Shown } from "./sw-push.ts";
import { networkWithin } from "./sw-race.ts";

// The project compiles against the DOM library, which has no service-worker types, so the
// few members used here are declared locally instead of pulling in the conflicting
// `webworker` lib.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface PushEvent extends ExtendableEvent {
  data: { json(): unknown } | null;
}
interface NotificationEvent extends ExtendableEvent {
  action: string;
  notification: { data: unknown; close(): void };
}
interface WindowClient {
  url: string;
  focus(): Promise<WindowClient>;
  navigate(url: string): Promise<WindowClient | null>;
}
interface ServiceWorkerScope {
  location: Location;
  skipWaiting(): Promise<void>;
  registration: { showNotification(title: string, options: Shown["options"]): Promise<void> };
  clients: {
    claim(): Promise<void>;
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<WindowClient[]>;
    openWindow(url: string): Promise<WindowClient | null>;
  };
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
  addEventListener(type: "push", listener: (event: PushEvent) => void): void;
  addEventListener(type: "notificationclick", listener: (event: NotificationEvent) => void): void;
}

const sw = self as unknown as ServiceWorkerScope;
// Same name as SHELL_CACHE in web/src/app/shell-cache.ts, which warms it on the first visit.
const CACHE = "cave-shell";

// No precache list: Bun's asset names differ between dev and production builds, so the
// shell is cached as it loads. One online visit is enough to open the app offline.
sw.addEventListener("install", (event) => event.waitUntil(sw.skipWaiting()));
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isShellRequest(request.method, request.url, sw.location.origin)) return;
  const network = fetchAndStore(request);
  // Keep the worker alive until a late response has refreshed the cache.
  event.waitUntil(network.catch(() => undefined));
  event.respondWith(networkWithin(network, () => fromCache(request)));
});

async function fetchAndStore(request: Request): Promise<Response> {
  const response = await fetch(request);
  if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function fromCache(request: Request): Promise<Response | undefined> {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  // Any app route renders from the same shell, so a page never visited online still opens.
  return request.mode === "navigate" ? cache.match("/") : undefined;
}

// Every push must show a notification (iOS revokes silent push), so even an unreadable payload
// shows a plain one. Nothing new is cached.
sw.addEventListener("push", (event) => {
  let data: unknown;
  try {
    data = event.data?.json();
  } catch {
    data = undefined;
  }
  const origin = sw.location.origin;
  const shown = fromPush(data, origin) ?? {
    title: "The Cave",
    options: { data: { navigate: `${origin}/`, actions: {} } },
  };
  event.waitUntil(sw.registration.showNotification(shown.title, shown.options));
});

// A click focuses an open Cave window and takes it there, or opens one.
sw.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = clickTarget(event.notification.data, event.action) ?? `${sw.location.origin}/`;
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === sw.location.origin);
      if (open) {
        const moved = await open.navigate(target).catch(() => null);
        await (moved ?? open).focus();
        return;
      }
      await sw.clients.openWindow(target);
    })(),
  );
});
