import { SYNC_PAGE_SIZE, type SyncResponse } from "../shared/types.ts";
import { isAuthorized } from "./auth.ts";
import type { Store } from "./store.ts";
import { isClockAhead, parseSyncRequest, rejectInvalid } from "./validate.ts";

export const MAX_BODY_BYTES = 8 * 1024 * 1024;

interface SyncHandlerOptions {
  store: Store;
  /** When set, requests need `Authorization: Bearer <token>`. */
  token: string | undefined;
  now: () => number;
  /** Told of every device that syncs, pulls included, for the system view. */
  onSync?: (deviceId: string, at: number) => void;
}

const error = (status: number, message: string) => Response.json({ error: message }, { status });

export function createSyncHandler({ store, token, now, onSync }: SyncHandlerOptions) {
  return async (req: Request): Promise<Response> => {
    if (token !== undefined && !isAuthorized(req, token)) return error(401, "unauthorized");

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return error(400, "body too large");
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES) return error(400, "body too large");

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return error(400, "invalid JSON");
    }
    const parsed = parseSyncRequest(body);
    if (!parsed.ok) return error(400, parsed.error);

    const { deviceId, cursor, changes } = parsed.value;
    const serverTime = now();
    // serverTime lets the client tell the owner their device clock is wrong.
    if (isClockAhead(changes, serverTime)) {
      return Response.json({ error: "clock ahead", serverTime }, { status: 400 });
    }
    // No await between this check and the write, so nothing can change in between.
    const { accepted, rejected } = rejectInvalid(changes, store.get);
    store.applyChanges(accepted, `user:${deviceId}`, serverTime);
    onSync?.(deviceId, serverTime);
    const page = store.changesSince(cursor, SYNC_PAGE_SIZE);
    const response: SyncResponse = {
      cursor: page.at(-1)?.seq ?? cursor,
      changes: page.map((row) => row.doc),
      rejected,
      serverTime,
      dbId: store.dbId(),
    };
    return Response.json(response);
  };
}
