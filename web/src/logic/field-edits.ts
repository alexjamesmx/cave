import { activeFields } from "../../../shared/fields.ts";
import type { CollectionData, Field, FieldType } from "../../../shared/schema.ts";
import type { Doc } from "../../../shared/types.ts";

/** A field id from its name: lowercase, `_`-separated, starting with a letter. */
export const fieldId = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 48);

/**
 * Adds a field. An id already in `fields` is refused even when that field is archived:
 * items still hold its values, and a new type would change what they mean.
 */
export function addField(
  fields: readonly Field[],
  name: string,
  type: FieldType,
): { fields: Field[] } | { error: string } {
  const id = fieldId(name);
  if (!id) return { error: "Give the field a name with letters or digits." };
  const existing = fields.find((f) => f.id === id);
  if (existing?.archived) {
    return { error: `“${existing.name}” was removed and still holds values; restore it instead.` };
  }
  if (existing) return { error: `A field “${id}” already exists.` };
  const field: Field = type === "select" ? { id, name, type, options: [] } : { id, name, type };
  return { fields: [...fields, field] };
}

/** Removing a field archives it; its values stay on the items and its id stays taken. */
export const archiveField = (fields: readonly Field[], id: string): Field[] =>
  fields.map((f) => (f.id === id ? { ...f, archived: true } : f));

export const restoreField = (fields: readonly Field[], id: string): Field[] =>
  fields.map((f) => {
    if (f.id !== id) return f;
    const { archived: _, ...rest } = f;
    return rest;
  });

/** The collection as views, the drawer and the command bar see it: archived fields hidden. */
export function withActiveFields<T extends Doc & { data: CollectionData }>(collection: T): T {
  return {
    ...collection,
    data: { ...collection.data, fields: activeFields(collection.data.fields) },
  };
}
