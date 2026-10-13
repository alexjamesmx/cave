import { TOKEN_KEY } from "./boot.ts";

/** GET from the owner API with this device's server token; `undefined` when unreachable. */
export async function ownerGet<T>(path: string): Promise<T | undefined> {
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch(path, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}
