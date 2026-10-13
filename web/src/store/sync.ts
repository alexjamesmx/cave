import { SYNC_PAGE_SIZE, type SyncRequest, type SyncResponse } from "../../../shared/types.ts";
import type { LocalStore } from "./local-store.ts";

export type Transport = (req: SyncRequest) => Promise<SyncResponse>;

/** Keeps each push well under the server's body and doc-count limits. */
export const PUSH_BATCH_SIZE = 200;

/** The server refused a stamp as too far ahead; the owner can run clock recovery. */
export class ClockAheadError extends Error {
  constructor(
    readonly serverTime: number,
    readonly deviceTime: number,
  ) {
    super(
      `device clock is ${Math.round((deviceTime - serverTime) / 60_000)} min ahead of the server`,
    );
    this.name = "ClockAheadError";
  }
}

export async function readSyncResponse(res: Response, deviceTime: number): Promise<SyncResponse> {
  if (res.ok) return (await res.json()) as SyncResponse;
  const body = (await res.json().catch(() => undefined)) as
    | { error?: unknown; serverTime?: unknown }
    | undefined;
  if (body?.error === "clock ahead" && typeof body.serverTime === "number") {
    throw new ClockAheadError(body.serverTime, deviceTime);
  }
  const reason = typeof body?.error === "string" ? `: ${body.error}` : "";
  throw new Error(`sync failed: HTTP ${res.status}${reason}`);
}

/** `now` is the local store's clock, so the reported gap is the one recovery would fix. */
export function httpTransport(url: string, now: () => number, token?: string): Transport {
  return async (req) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(req) });
    return readSyncResponse(res, now());
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
