/** Where a resumed page says it is back: the document's visibility, the window's focus and pageshow. */
interface ClockTargets {
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  document: Pick<EventTarget, "addEventListener" | "removeEventListener">;
}

/**
 * Calls `tick` every minute and whenever the page comes back. A phone suspends timers while
 * the app is in the background, so the interval alone leaves "now" hours late after a resume.
 */
export function watchClock(targets: ClockTargets, tick: () => void, everyMs = 60_000): () => void {
  const id = setInterval(tick, everyMs);
  targets.document.addEventListener("visibilitychange", tick);
  targets.window.addEventListener("focus", tick);
  targets.window.addEventListener("pageshow", tick);
  return () => {
    clearInterval(id);
    targets.document.removeEventListener("visibilitychange", tick);
    targets.window.removeEventListener("focus", tick);
    targets.window.removeEventListener("pageshow", tick);
  };
}
