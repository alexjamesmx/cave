import { TOKEN_KEY } from "./boot.ts";

export const REFUSED = "That token doesn't open this Cave.";
export const UNREACHABLE = "Can't reach the server. Check the connection and try again.";

/**
 * Checks a token against the owner API before keeping it. `undefined` means it was stored;
 * otherwise the reason to show. A refused token is never stored.
 */
export async function unlock(
  token: string,
  fetchFn: typeof fetch = fetch,
  storage: Pick<Storage, "setItem"> = localStorage,
): Promise<string | undefined> {
  const value = token.trim();
  if (!value) return REFUSED;
  let res: Response;
  try {
    res = await fetchFn("/api/status", { headers: { authorization: `Bearer ${value}` } });
  } catch {
    return UNREACHABLE;
  }
  if (res.status === 401) return REFUSED;
  if (!res.ok) return UNREACHABLE;
  storage.setItem(TOKEN_KEY, value);
  return undefined;
}

export const hasToken = () => localStorage.getItem(TOKEN_KEY) !== null;

/**
 * The server refused the token (rotated, revoked): drop it and reload into the lock screen,
 * so nothing from the local copy stays on screen.
 */
export function expire(): void {
  if (!hasToken()) return;
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}

/** "Lock this device": the local copy stays for the next unlock. */
export function lockDevice(): void {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}

/** "Forget this device": the token, the local copy and the offline caches all go. */
export async function forgetDevice(closeDb: () => void): Promise<void> {
  localStorage.clear();
  closeDb();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("cave");
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  if ("caches" in window) for (const key of await caches.keys()) await caches.delete(key);
  location.reload();
}
