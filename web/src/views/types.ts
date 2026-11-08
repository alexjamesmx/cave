import type { View } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import type { CollectionDoc } from "../store/queries.ts";

export interface ViewProps {
  collection: CollectionDoc;
  view: View;
  /** The collection's live items, already without deleted ones. */
  items: Doc[];
  open(id: string): void;
}
