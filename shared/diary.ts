import type { CollectionData, View } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * The diary (M12 part 8): Today and Days replace Write, Habits and Months. Habits stay the
 * journal's checkbox fields; their icons, which lived in the retired Habits view's config, are
 * a setting.
 */

/** `settings.habitIcons`, read defensively: a habit field id to a Lucide icon name. */
export function habitIconsOf(
  settings: Record<string, unknown> | undefined,
): Record<string, string> {
  const raw = settings?.habitIcons;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "",
    ),
  );
}

/** A journal field id from a habit's name: "LeetCode grind" → "leetcode_grind". */
export const habitId = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "habit";

/** View types the diary no longer has a page for. */
const RETIRED: readonly string[] = ["habits"];
/** The seed's own views by id; an owner's views with other ids are kept. */
const SEED_RETIRED_IDS: readonly string[] = ["habits", "gallery"];

type SeedDoc = {
  id: string;
  kind: Doc["kind"];
  collection?: string;
  data: Record<string, unknown>;
};

/**
 * Seed migration 20: the journal loses the seed's Habits and Gallery views (and any view of a
 * retired type), and the Habits view's icons move to `settings.habitIcons` unless the owner
 * already has some there. Nothing else changes.
 */
export function diaryMigration(get: (id: string) => Doc | undefined): SeedDoc[] {
  const journal = get("journal");
  if (journal?.kind !== "collection" || journal.data._deleted === true) return [];
  const views = (journal.data as unknown as CollectionData).views;
  if (!Array.isArray(views)) return [];
  const gone = (v: View) => RETIRED.includes(v.type) || SEED_RETIRED_IDS.includes(v.id);
  if (!views.some(gone)) return [];
  const docs: SeedDoc[] = [
    { id: "journal", kind: "collection", data: { views: views.filter((v) => !gone(v)) } },
  ];
  const settings = get("settings");
  const icons = views
    .filter((v) => RETIRED.includes(v.type))
    .flatMap((v) => (Array.isArray(v.config?.habits) ? (v.config.habits as unknown[]) : []))
    .filter(
      (h): h is { id: string; icon: string } =>
        typeof (h as { id?: unknown })?.id === "string" &&
        typeof (h as { icon?: unknown })?.icon === "string",
    );
  if (settings && icons.length > 0 && Object.keys(habitIconsOf(settings.data)).length === 0)
    docs.push({
      id: "settings",
      kind: "setting",
      data: { habitIcons: Object.fromEntries(icons.map((h) => [h.id, h.icon])) },
    });
  return docs;
}
