import type { View } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";
import type { CollectionDoc } from "../store/queries.ts";

export interface ViewProps {
  collection: CollectionDoc;
  view: View;
  /** The collection's live items, already without deleted ones. */
  items: Doc[];
  open(id: string): void;
  /** Values every new item gets: the project when the view is scoped to one. */
  preset?: Record<string, unknown>;
}
