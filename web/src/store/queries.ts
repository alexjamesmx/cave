import type { CollectionData } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import type { LocalDb } from "./db.ts";
import { useLive } from "./live.ts";

export type CollectionDoc = Doc & { data: CollectionData };

const live = (doc: Doc) => doc.data._deleted !== true;

export function useCollections(db: LocalDb): CollectionDoc[] | undefined {
  return useLive(async () => {
    const docs = await db.docs.where("kind").equals("collection").toArray();
    return (docs.filter(live) as CollectionDoc[]).sort((a, b) => a.data.order - b.data.order);
  }, [db]);
}

export function useItems(db: LocalDb, collection: string): Doc[] | undefined {
  return useLive(
    async () => (await db.docs.where("collection").equals(collection).toArray()).filter(live),
    [db, collection],
  );
}

/** Every live item, for counts across collections. */
export function useAllItems(db: LocalDb): Doc[] | undefined {
  return useLive(
    async () => (await db.docs.where("kind").equals("item").toArray()).filter(live),
    [db],
  );
}

export function useDoc(db: LocalDb, id: string | undefined): Doc | undefined {
  return useLive(async () => (id ? db.docs.get(id) : undefined), [db, id]);
}
