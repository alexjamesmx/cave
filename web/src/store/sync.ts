import { SYNC_PAGE_SIZE, type SyncRequest, type SyncResponse } from "../../../shared/types.ts";
import type { LocalStore } from "./local-store.ts";

export type Transport = (req: SyncRequest) => Promise<SyncResponse>;

/** Keeps each push well under the server's body and doc-count limits. */
export const PUSH_BATCH_SIZE = 200;

export function httpTransport(url: string, token?: string): Transport {
  return async (req) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(req) });
    if (!res.ok) throw new Error(`sync failed: HTTP ${res.status}`);
    return (await res.json()) as SyncResponse;
  };
}

/**
 * Pushes the outbox in batches, then keeps pulling until a page comes back short.
 * Each round is applied before the next request, so a failure loses no progress.
 */
export async function syncOnce(local: LocalStore, transport: Transport) {
  const pending = await local.pending();
  let cursor = await local.cursor();
  let pushed = 0;
  let pulled = 0;

  for (;;) {
    const batch = pending.slice(pushed, pushed + PUSH_BATCH_SIZE);
    const res = await transport({
      deviceId: local.deviceId,
      cursor,
      changes: batch.map((p) => p.doc),
    });
    await local.applyPulled(
      res.changes,
      res.cursor,
      batch.map((p) => p.row),
    );
    pushed += batch.length;
    pulled += res.changes.length;
    cursor = res.cursor;
    if (pushed < pending.length) continue;
    if (res.changes.length < SYNC_PAGE_SIZE) return { pushed, pulled };
  }
}
