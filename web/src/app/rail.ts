/**
 * The rail's width (M12 part 9): icons only, or icons with the sections' names. A choice per
 * device, kept in localStorage; a private window or blocked storage just starts narrow. The
 * class is set on <html> before the first render, so the page never jumps.
 */
const KEY = "cave.rail";
const CLASS = "rail-wide";

export function railWide(): boolean {
  try {
    return localStorage.getItem(KEY) === "wide";
  } catch {
    return false;
  }
}

export function setRailWide(wide: boolean): void {
  try {
    if (wide) localStorage.setItem(KEY, "wide");
    else localStorage.removeItem(KEY);
  } catch {
    // Not kept, but this page still follows the choice.
  }
  document.documentElement.classList.toggle(CLASS, wide);
}

export const applyRail = () => document.documentElement.classList.toggle(CLASS, railWide());
