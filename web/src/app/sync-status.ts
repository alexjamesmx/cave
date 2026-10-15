import { ClockAheadError, SyncRefusedError } from "../store/sync.ts";

export type SyncStatus =
  | { phase: "idle"; lastSyncedAt: number | undefined }
  | { phase: "syncing"; lastSyncedAt: number | undefined }
  | { phase: "offline"; lastSyncedAt: number | undefined }
  | { phase: "clock-ahead"; lastSyncedAt: number | undefined; error: ClockAheadError }
  /** The server refused this device's token, or it has none: a new install or a new token. */
  | { phase: "unauthorized"; lastSyncedAt: number | undefined }
  | { phase: "error"; lastSyncedAt: number | undefined; message: string };

/** What a failed sync means for the owner; a fetch TypeError is the network, not a bug. */
export function failedStatus(
  error: unknown,
  lastSyncedAt: number | undefined,
  online: boolean,
): SyncStatus {
  if (error instanceof ClockAheadError) return { phase: "clock-ahead", lastSyncedAt, error };
  if (!online || error instanceof TypeError) return { phase: "offline", lastSyncedAt };
  if (error instanceof SyncRefusedError && error.status === 401)
    return { phase: "unauthorized", lastSyncedAt };
  return { phase: "error", lastSyncedAt, message: (error as Error)?.message ?? String(error) };
}
