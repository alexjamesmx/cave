import Dexie, { type EntityTable } from "dexie";
import type { ClockState } from "../../../shared/hlc.ts";
import type { Doc } from "../../../shared/types.ts";

/** A pending local change; `rev` tells whether the doc was written again during a sync. */
export interface OutboxRow {
  id: string;
  rev: number;
}

export type MetaRow = { key: "cursor"; value: number } | { key: "clock"; value: ClockState };

export type LocalDb = Dexie & {
  docs: EntityTable<Doc, "id">;
  outbox: EntityTable<OutboxRow, "id">;
  meta: EntityTable<MetaRow, "key">;
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
  return db;
}
