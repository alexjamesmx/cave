import { NOTES } from "./notes.ts";
import { PALETTE } from "./palette.ts";
import type { CollectionData } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * The radar (M9 part B): what agents find for the owner. Nothing shows it since M12 (the owner
 * reads agents in Claude); the collection stays under Settings → Data, and agents that still
 * write it do so under the rules the agent writer enforces (a safe URL, a reason, one item per
 * URL, 50 a day).
 */

export const RADAR = "radar";
export const RADAR_PER_DAY = 50;

export const RADAR_COLLECTION: CollectionData = {
  name: "Radar",
  icon: "radar",
  color: PALETTE.teal,
  order: 13,
  fields: [
    { id: "url", name: "URL", type: "url" },
    { id: "source", name: "Source", type: "text" },
    { id: "interests", name: "Interests", type: "text" },
    { id: "why", name: "Why", type: "text" },
    { id: "found_at", name: "Found", type: "date", config: { withTime: true } },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        { value: "new", icon: "sparkle", color: PALETTE.teal },
        { value: "saved", icon: "bookmark", color: PALETTE.ok },
        { value: "dismissed", icon: "x", color: PALETTE.grey },
      ],
    },
    { id: "note", name: "Note", type: "ref", config: { collection: NOTES } },
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** One finding per address: case-insensitive host, no trailing slash, no fragment. */
export function sameUrl(url: unknown): string {
  try {
    const u = new URL(text(url).trim());
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return text(url).trim();
  }
}

/** Seed migration 15: the radar collection, where missing. Its interests setting retired in M12. */
export function radarMigration(
  get: (id: string) => Doc | undefined,
): { id: string; kind: "collection"; data: Record<string, unknown> }[] {
  return get(RADAR) ? [] : [{ id: RADAR, kind: "collection", data: RADAR_COLLECTION }];
}
