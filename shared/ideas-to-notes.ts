import { optionText } from "./categories.ts";
import { fieldsOf, resolveFields } from "./fields.ts";
import { isDocId } from "./ids.ts";
import { IDEAS_TOPIC, NOTES } from "./notes.ts";
import type { Field } from "./schema.ts";
import type { Doc, Kind } from "./types.ts";

type SeedDoc = { id: string; kind: Kind; collection?: string; data: Record<string, unknown> };

/** The collection Ideas kept from M2 to M13. */
const IDEAS = "ideas";

const PREFIX = "note-from-";

/**
 * The note an idea becomes. Derived, so the migration can never write two notes for one idea.
 * Slugs are lower case only, so a ULID is lowered (it is upper case only, so this stays unique);
 * a slug too long to take the prefix gets a hash of itself instead, or sync would refuse the id.
 */
export function noteIdOf(ideaId: string): string {
  const id = `${PREFIX}${ideaId.toLowerCase()}`;
  return isDocId(id) ? id : `${PREFIX}${fnv1a(ideaId)}`;
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A value as the note shows it; `undefined` when it holds nothing worth a line. */
function valueText(
  field: Field | undefined,
  value: unknown,
  get: (id: string) => Doc | undefined,
): string | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  if (value === true) return "yes";
  if (field?.type === "select" && typeof value === "string") {
    const option = field.options?.find((o) => o.value === value);
    return option ? optionText(option) : value;
  }
  // A ref reads as what it points at, even a retired project, so the line still means something.
  if (field?.type === "ref" && typeof value === "string") {
    const title = get(value)?.data._title;
    return typeof title === "string" && title.trim() ? title.trim() : value;
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/**
 * An idea's Markdown body as a note: its own text first, then one `- **Field:** value` line
 * per non-empty field, archived ones included, in the collection's order, then any key no field
 * names. A value over several lines stays inside its list item.
 */
export function ideaBody(
  idea: Doc,
  fields: readonly Field[],
  get: (id: string) => Doc | undefined,
): string {
  const line = (label: string, text: string) => `- **${label}:** ${text.replace(/\n/g, "\n  ")}`;
  const named = new Set(fields.map((f) => f.id));
  const lines = [
    ...fields.map((f) => [f.name || f.id, valueText(f, idea.data[f.id], get)] as const),
    ...Object.keys(idea.data)
      .filter((k) => !k.startsWith("_") && !named.has(k))
      .sort()
      .map((k) => [k, valueText(undefined, idea.data[k], get)] as const),
  ].flatMap(([label, text]) => (text === undefined ? [] : [line(label, text)]));
  const own = typeof idea.data._body === "string" ? idea.data._body.trim() : "";
  return [own, lines.join("\n")].filter(Boolean).join("\n\n");
}

/** The note an idea becomes: its title, its body as above, its creation time and author. */
function noteOf(
  idea: Doc,
  fields: readonly Field[],
  get: (id: string) => Doc | undefined,
): Record<string, unknown> {
  const title = typeof idea.data._title === "string" ? idea.data._title.trim() : "";
  const body = ideaBody(idea, fields, get);
  const agent = typeof idea.data._addedBy === "string" && idea.data._addedBy !== "";
  return {
    _title: title || "Untitled idea",
    ...(body ? { _body: body } : {}),
    ...(typeof idea.data._created === "string" ? { _created: idea.data._created } : {}),
    ...(agent ? { _addedBy: idea.data._addedBy } : {}),
    folder: IDEAS_TOPIC,
    source: agent ? "agent" : "owner",
  };
}

/**
 * Seed migration 26 (M14): Ideas are notes. Every live idea becomes a note in topic Ideas whose
 * body holds every field it had, so nothing is lost; the idea and the collection are marked
 * deleted, never removed, as migration 24 did with Projects, so undo still works. An agent's
 * pending proposal to delete an idea now names its note. No ref field ever pointed at ideas
 * (refs come only from the seed), so there is nothing to archive. A database with no live
 * `ideas` collection gets nothing, so a second run, or a fresh seed, writes nothing.
 */
export function ideasToNotesMigration(
  get: (id: string) => Doc | undefined,
  items: (collection: string) => Doc[],
): SeedDoc[] {
  const collection = get(IDEAS);
  if (collection?.kind !== "collection" || collection.data._deleted === true) return [];
  const fields = resolveFields(fieldsOf(collection), get);
  const docs: SeedDoc[] = [];
  const moved = new Map<string, string>();
  for (const idea of items(IDEAS)) {
    if (idea.data._deleted === true) continue;
    const noteId = noteIdOf(idea.id);
    // A note already there is the owner's now; it is never written over.
    if (!get(noteId))
      docs.push({ id: noteId, kind: "item", collection: NOTES, data: noteOf(idea, fields, get) });
    docs.push({ id: idea.id, kind: "item", collection: IDEAS, data: { _deleted: true } });
    moved.set(idea.id, noteId);
  }
  docs.push({ id: IDEAS, kind: "collection", data: { _deleted: true } });
  for (const proposal of items("proposals")) {
    const note = moved.get(String(proposal.data.target));
    if (note && proposal.data.status === "pending" && proposal.data._deleted !== true)
      docs.push({ id: proposal.id, kind: "item", collection: "proposals", data: { target: note } });
  }
  return docs;
}
