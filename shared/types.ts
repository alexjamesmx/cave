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

/** A pushed doc the server did not apply because a value it changes is invalid. */
export interface Rejection {
  id: string;
  error: string;
}

export interface SyncResponse {
  cursor: number;
  changes: Doc[];
  rejected: Rejection[];
  /** Lets the client spot a wrong device clock and measure the offset at this moment. */
  serverTime: number;
}

/** A key's value and stamp before a change; `null` when the key did not exist yet. */
export type Before = Record<string, { value: unknown; stamp: Stamp } | null>;

/** One row of the server's activity log. */
export interface Change {
  seq: number;
  id: string;
  actor: string;
  at: number;
  keys: string[];
  /** `null` for rows written before previous values were recorded. */
  before: Before | null;
}

/** Upper bound on docs per pull page; a shorter page means the client is caught up. */
export const SYNC_PAGE_SIZE = 1000;
