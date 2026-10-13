export const WRITE_DEBOUNCE_MS = 1000;
export const SYNC_INTERVAL_MS = 60_000;

type TimerId = ReturnType<typeof setTimeout> | number;

export interface SchedulerTimers {
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
  setInterval(fn: () => void, ms: number): TimerId;
  clearInterval(id: TimerId): void;
}

export interface SchedulerOptions {
  sync: () => Promise<unknown>;
  window: EventTarget;
  document: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  timers: SchedulerTimers;
  /** Failures are expected while offline; the next trigger retries. */
  onError: (error: unknown) => void;
}

/**
 * Runs `sync` on start, 1 s after the last local write, on `online`, when the tab
 * becomes visible and every 60 s. Never runs two syncs at once: triggers that arrive
 * mid-sync collapse into a single follow-up run.
 */
export function startSyncScheduler({ sync, window, document, timers, onError }: SchedulerOptions) {
  let running: Promise<void> | undefined;
  let again = false;
  let debounce: TimerId | undefined;

  const run = (): void => {
    if (running) {
      again = true;
      return;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await sync();
        } catch (error) {
          onError(error);
        }
      } while (again);
      running = undefined;
    })();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") run();
  };

  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", onVisibility);
  const interval = timers.setInterval(run, SYNC_INTERVAL_MS);
  run();

  return {
    notifyWrite(): void {
      if (debounce !== undefined) timers.clearTimeout(debounce);
      debounce = timers.setTimeout(() => {
        debounce = undefined;
        run();
      }, WRITE_DEBOUNCE_MS);
    },
    /** Runs a sync now, or right after the one in flight; e.g. after clock recovery. */
    syncNow: run,
    /** Resolves once no sync is running or queued. */
    async idle(): Promise<void> {
      while (running) await running;
    },
    stop(): void {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisibility);
      timers.clearInterval(interval);
      if (debounce !== undefined) timers.clearTimeout(debounce);
      debounce = undefined;
    },
  };
}
