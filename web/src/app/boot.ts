import { newId } from "../../../shared/ids.ts";
import { openLocalDb } from "../store/db.ts";
import { LocalStore } from "../store/local-store.ts";
import { startSyncScheduler } from "../store/scheduler.ts";
import { type ClockAheadError, httpTransport, syncOnce } from "../store/sync.ts";
import { expire } from "./lock.ts";
import { createSignal, type Signal } from "./signal.ts";
import { failedStatus, type SyncStatus } from "./sync-status.ts";

const DEVICE_KEY = "cave.deviceId";
export const TOKEN_KEY = "cave.token";

export interface Cave {
  local: LocalStore;
  status: Signal<SyncStatus>;
  syncNow(): void;
  /** Runs a sync and waits for it; `true` when it reached the server and finished. */
  syncAndWait(): Promise<boolean>;
  /** Owner-confirmed clock recovery after a `clock ahead` refusal. */
  recoverClock(refusal: ClockAheadError): Promise<number>;
}

function deviceId(): string {
  const saved = localStorage.getItem(DEVICE_KEY);
  if (saved) return saved;
  const id = newId();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

/** Opens this device's copy and starts syncing with the server that served the page. */
export async function boot(): Promise<Cave> {
  const status = createSignal<SyncStatus>({ phase: "idle", lastSyncedAt: undefined });
  let notifyWrite = () => {};
  const local = await LocalStore.open({
    db: openLocalDb("cave"),
    deviceId: deviceId(),
    onWrite: () => notifyWrite(),
  });

  const sync = async () => {
    const { lastSyncedAt } = status.get();
    status.set({ phase: "syncing", lastSyncedAt });
    const token = localStorage.getItem(TOKEN_KEY) ?? undefined;
    try {
      await syncOnce(local, httpTransport("/api/sync", local, token));
      status.set({ phase: "idle", lastSyncedAt: Date.now() });
    } catch (error) {
      const failed = failedStatus(error, lastSyncedAt, navigator.onLine);
      if (failed.phase === "unauthorized") return expire();
      status.set(failed);
    }
  };

  const scheduler = startSyncScheduler({
    sync,
    window,
    document,
    // Browser timers throw "Illegal invocation" when called as methods of another object.
    timers: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id),
    },
    onError: (error) =>
      status.set(failedStatus(error, status.get().lastSyncedAt, navigator.onLine)),
  });
  notifyWrite = scheduler.notifyWrite;

  return {
    local,
    status,
    syncNow: scheduler.syncNow,
    async syncAndWait() {
      scheduler.syncNow();
      await scheduler.idle();
      return status.get().phase === "idle";
    },
    async recoverClock({ serverTime, rawDeviceTime }) {
      const restamped = await local.recoverClock(serverTime, rawDeviceTime);
      scheduler.syncNow();
      return restamped;
    },
  };
}
