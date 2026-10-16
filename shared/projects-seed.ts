import {
  DEFAULT_TEMPLATES,
  LINKED,
  PART_FIELD,
  PARTS,
  PARTS_COLLECTION,
  PROJECT_FIELDS,
  PROJECTS,
  projectRef,
} from "./projects.ts";
import type { CollectionData, Field } from "./schema.ts";
import type { Doc, Kind } from "./types.ts";

type SeedDoc = { id: string; kind: Kind; collection?: string; data: Record<string, unknown> };

/** A collection's fields with the M8 ones it should have, the owner's own kept as they are. */
export function withProjectFields(id: string, fields: Field[]): Field[] {
  const add: Field[] = [];
  if (LINKED.includes(id)) add.push(projectRef);
  if (id === "tasks") add.push(PART_FIELD);
  if (id === PROJECTS) add.push(...PROJECT_FIELDS);
  return [...fields, ...add.filter((a) => !fields.some((f) => f.id === a.id))];
}

/** The Cave's milestones, as its parts, with where they stood when M8 began. */
const CAVE_MILESTONES: [string, string, string][] = [
  ["m1", "M1: core and sync", "done"],
  ["m2", "M2: import and views", "done"],
  ["m3", "M3: offline shell and agents", "done"],
  ["m4", "M4: daily use", "done"],
  ["m5", "M5: hosted", "done"],
  ["m6", "M6: anywhere", "done"],
  ["m7", "M7: reminders, notifications, calendar, flows, the system view", "done"],
  ["m7b", "M7b: daily driver", "done"],
  ["m8", "M8: one structure, and Projects", "active"],
  ["m9", "M9: notes and radar", "planned"],
];

export const LEETCODE_PROJECT = "proj-leetcode";
export const CAVE_PROJECT = "proj-cave";
export const LEETCODE_PROJECT_DATA = { _title: "LeetCode", status: "active", template: "learning" };

/**
 * Seed migration 9 (M8 part 2), computed from what the database holds. Nothing is deleted:
 * fields are added where missing, LeetCode items get the LeetCode project only when they have
 * none, and existing projects get a template only when they have none.
 */
export function projectsMigration(
  get: (id: string) => Doc | undefined,
  items: (collection: string) => Doc[],
  now: string,
): SeedDoc[] {
  const docs: SeedDoc[] = [];
  const live = (d: Doc | undefined) => d !== undefined && d.data._deleted !== true;

  for (const id of [...LINKED, PROJECTS]) {
    const c = get(id);
    if (c?.kind !== "collection" || !live(c)) continue;
    const fields = (c.data as unknown as CollectionData).fields;
    if (!Array.isArray(fields)) continue;
    const next = withProjectFields(id, fields);
    if (next.length !== fields.length)
      docs.push({ id, kind: "collection", data: { fields: next } });
  }
  if (!get(PARTS)) docs.push({ id: PARTS, kind: "collection", data: PARTS_COLLECTION });
  if (get("settings")?.data.projectTemplates === undefined)
    docs.push({ id: "settings", kind: "setting", data: { projectTemplates: DEFAULT_TEMPLATES } });

  const created = { _created: now };
  if (!get(LEETCODE_PROJECT))
    docs.push({
      id: LEETCODE_PROJECT,
      kind: "item",
      collection: PROJECTS,
      data: { ...created, ...LEETCODE_PROJECT_DATA },
    });
  for (const item of items("leetcode"))
    if (live(item) && typeof item.data.project !== "string")
      docs.push({
        id: item.id,
        kind: "item",
        collection: "leetcode",
        data: { project: LEETCODE_PROJECT },
      });

  if (!get(CAVE_PROJECT)) {
    docs.push({
      id: CAVE_PROJECT,
      kind: "item",
      collection: PROJECTS,
      data: {
        ...created,
        _title: "Cave",
        status: "active",
        template: "software",
        goal: "One place for money, tasks, habits, diary, ideas, learning and notes, that any agent can read and act on.",
      },
    });
    for (const [i, [slug, title, status]] of CAVE_MILESTONES.entries())
      docs.push({
        id: `part-cave-${slug}`,
        kind: "item",
        collection: PARTS,
        data: {
          ...created,
          _title: title,
          project: CAVE_PROJECT,
          status,
          kind: "milestone",
          order: i + 1,
        },
      });
  }
  for (const p of items(PROJECTS))
    if (
      live(p) &&
      p.id !== CAVE_PROJECT &&
      p.id !== LEETCODE_PROJECT &&
      typeof p.data.template !== "string"
    )
      docs.push({ id: p.id, kind: "item", collection: PROJECTS, data: { template: "generic" } });
  return docs;
}
