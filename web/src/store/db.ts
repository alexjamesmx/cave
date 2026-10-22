import Dexie, { type EntityTable } from "dexie";
import type { ClockState } from "../../../shared/hlc.ts";
import type { Doc, Rejection } from "../../../shared/types.ts";

/** A pending local change; `rev` tells whether the doc was written again during a sync. */
export interface OutboxRow {
  id: string;
  rev: number;
}

type MetaRow =
  | { key: "cursor"; value: number }
  | { key: "clock"; value: ClockState }
  /** Server time minus device time, set by clock recovery; added to every local time. */
  | { key: "clockOffset"; value: number }
  /** The server database this copy last synced with; see `LocalStore.adoptServer`. */
  | { key: "dbId"; value: string };

export type LocalDb = Dexie & {
  docs: EntityTable<Doc, "id">;
  outbox: EntityTable<OutboxRow, "id">;
  meta: EntityTable<MetaRow, "key">;
  /** Outbox docs the server refused, with its reason; cleared when a push is accepted. */
  rejected: EntityTable<Rejection, "id">;
};

/** `deps` lets tests pass an IndexedDB implementation; browsers use the global one. */
export function openLocalDb(
  name: string,
  deps?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange },
): LocalDb {
  const db = new Dexie(name, deps) as LocalDb;
  db.version(1).stores({
    docs: "id, kind, collection",
    outbox: "id",
    meta: "key",
  });
  db.version(2).stores({ rejected: "id" });
  return db;
}
