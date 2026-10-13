import { liveQuery } from "dexie";
import { useMemo, useSyncExternalStore } from "react";

interface Source<T> {
  subscribe(listener: () => void): () => void;
  get(): T | undefined;
}

// One Dexie liveQuery per source; the last result is cached, as useSyncExternalStore needs.
function liveSource<T>(query: () => Promise<T>): Source<T> {
  let value: T | undefined;
  let failure: { error: unknown } | undefined;
  const listeners = new Set<() => void>();
  let subscription: { unsubscribe(): void } | undefined;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      subscription ??= liveQuery(query).subscribe({
        next: (next) => {
          value = next;
          notify();
        },
        error: (error) => {
          failure = { error };
          notify();
        },
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          subscription?.unsubscribe();
          subscription = undefined;
        }
      };
    },
    get() {
      if (failure) throw failure.error;
      return value;
    },
  };
}

/**
 * Result of an IndexedDB query, re-run whenever the tables it read change (in this tab or
 * another). `undefined` until the first result. `deps` lists what the query closes over.
 */
export function useLive<T>(query: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are the caller's query inputs
  const source = useMemo(() => liveSource(query), deps);
  return useSyncExternalStore(source.subscribe, source.get);
}
