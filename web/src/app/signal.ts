import { useSyncExternalStore } from "react";

export interface Signal<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

/** A value outside React that components can read and re-render on. */
export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useSignal = <T>(signal: Signal<T>): T =>
  useSyncExternalStore(signal.subscribe, signal.get);
