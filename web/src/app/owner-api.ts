import { TOKEN_KEY } from "./boot.ts";
import { expire } from "./lock.ts";

/** GET from the owner API with this device's server token; `undefined` when unreachable. */
export async function ownerGet<T>(path: string): Promise<T | undefined> {
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch(path, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) expire();
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Saves a file the owner API serves as an attachment; `false` when the server refused it. */
export async function ownerDownload(path: string): Promise<boolean> {
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch(path, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) expire();
    if (!res.ok) return false;
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1];
    const url = URL.createObjectURL(await res.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: name ?? "" });
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** POST JSON to the owner API; `undefined` when unreachable or refused. */
export async function ownerPost<T>(path: string, body: unknown): Promise<T | undefined> {
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) expire();
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}
