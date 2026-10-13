export const KINDS = ["collection", "item", "setting"] as const;
export type Kind = (typeof KINDS)[number];

/** `<ms, 13 digits>:<counter, 4 digits>:<deviceId>`; string order is causal order. */
export type Stamp = string;

export interface Doc {
  id: string;
  kind: Kind;
  collection: string | null;
  data: Record<string, unknown>;
  stamps: Record<string, Stamp>;
  actor: string;
}

export interface SyncRequest {
  deviceId: string;
  cursor: number;
  changes: Doc[];
}

export interface SyncResponse {
  cursor: number;
  changes: Doc[];
}

/** Upper bound on docs per pull page; a shorter page means the client is caught up. */
export const SYNC_PAGE_SIZE = 1000;
