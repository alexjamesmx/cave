import { COLOR_FIELD } from "./pages.ts";
import { PALETTE } from "./palette.ts";
import { PROJECTS } from "./projects.ts";
import type { CollectionData } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * Notes live in the Cave (M9 part A): the title is `_title`, the Markdown is `_body`, and a
 * `/`-separated `folder` groups them. They belong to projects through the `project` ref, and
 * link to each other with `[[wikilinks]]`.
 */

export const NOTES = "notes";
export const INBOX = "Inbox";

export const NOTES_COLLECTION: CollectionData = {
  name: "Notes",
  icon: "notebook-pen",
  color: PALETTE.vio,
  order: 12,
  fields: [
    { id: "folder", name: "Folder", type: "text" },
    { id: "url", name: "URL", type: "url" },
    {
      id: "source",
      name: "Source",
      type: "select",
      options: [
        { value: "owner", icon: "user", color: PALETTE.ok },
        { value: "agent", icon: "bot", color: PALETTE.purple },
        { value: "radar", icon: "radar", color: PALETTE.teal },
        { value: "import", icon: "download", color: PALETTE.grey },
      ],
    },
    { id: "project", name: "Project", type: "ref", config: { collection: PROJECTS } },
    COLOR_FIELD,
  ],
  views: [
    { id: "table", name: "Table", type: "table", config: {} },
    { id: "gallery", name: "Gallery", type: "gallery", config: {} },
  ],
};

/** Seed migration 14: the notes collection, when the database has none. */
export function notesMigration(
  get: (id: string) => Doc | undefined,
): { id: string; kind: "collection"; data: Record<string, unknown> }[] {
  return get(NOTES) ? [] : [{ id: NOTES, kind: "collection", data: NOTES_COLLECTION }];
}

/** A folder as stored: trimmed segments joined by `/`, no empty ones; the root is "". */
export const normFolder = (raw: unknown) =>
  typeof raw === "string"
    ? raw
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("/")
    : "";
