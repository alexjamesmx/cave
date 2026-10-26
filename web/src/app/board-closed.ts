/**
 * Whether the tasks board shows its Done and Dropped columns (M13). A choice per device, kept in
 * localStorage; a private window or blocked storage just starts with them hidden.
 */
const KEY = "cave.board.closed";

export function showClosed(): boolean {
  try {
    return localStorage.getItem(KEY) === "shown";
  } catch {
    return false;
  }
}

export function setShowClosed(shown: boolean): void {
  try {
    if (shown) localStorage.setItem(KEY, "shown");
    else localStorage.removeItem(KEY);
  } catch {
    // Not kept, but this page still follows the choice.
  }
}
