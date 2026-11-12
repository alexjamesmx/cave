/**
 * Runs at most one task per key at a time: a second tap on the same Paid or ✓ while the first
 * write is still landing is ignored, so it can't log a second expense or skip a date.
 * Returns whether `task` ran.
 */
export function oncePerKey() {
  const busy = new Set<string>();
  return (key: string, task: () => Promise<unknown>): boolean => {
    if (busy.has(key)) return false;
    busy.add(key);
    void task().finally(() => busy.delete(key));
    return true;
  };
}
