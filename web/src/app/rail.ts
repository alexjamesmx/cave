/**
 * The sidebar's width: tiles with the sections' names (the default since M14), or tiles only.
 * A choice per device, kept in localStorage; a private window or blocked storage just starts
 * wide. The class is set on <html> before the first render, so the page never jumps.
 */
const KEY = "cave.rail";
const CLASS = "rail-narrow";

export function railWide(): boolean {
  try {
    return localStorage.getItem(KEY) !== "narrow";
  } catch {
    return true;
  }
}

export function setRailWide(wide: boolean): void {
  try {
    if (wide) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "narrow");
  } catch {
    // Not kept, but this page still follows the choice.
  }
  document.documentElement.classList.toggle(CLASS, !wide);
}

export const applyRail = () => document.documentElement.classList.toggle(CLASS, !railWide());
