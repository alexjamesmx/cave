import { useCave } from "../app/context.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { useCollections } from "../store/queries.ts";
import { ItemDrawer } from "./ItemDrawer.tsx";

/** The item drawer for any item, for pages that list items of several collections. */
export function DocDrawer({
  id,
  collection,
  onClose,
}: {
  id: string;
  collection: string;
  onClose(): void;
}) {
  const collections = useCollections(useCave().local.db);
  const stored = collections?.find((c) => c.id === collection);
  if (!stored) return null;
  return <ItemDrawer key={id} collection={withActiveFields(stored)} id={id} onClose={onClose} />;
}
