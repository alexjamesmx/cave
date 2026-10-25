import { PALETTE } from "./palette.ts";
import { DEFAULT_TEMPLATES, type ProjectTemplate } from "./projects.ts";
import type { CollectionData, Field, SelectOption } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * Pages and the study tracker (M12 part 6): a `color` on notes and diary days, the fields the
 * LeetCode tracker needs, and the `study` template. Seed migration 19 adds what a database
 * lacks and changes nothing the owner wrote.
 */

const opt = (value: string, icon: string, color: string, label?: string): SelectOption => ({
  value,
  icon,
  color,
  ...(label ? { label } : {}),
});

/** The palette's status tokens as a colour the owner can put on a page or a day. */
export const COLOR_FIELD: Field = {
  id: "color",
  name: "Colour",
  type: "select",
  options: [
    opt("ok", "circle", PALETTE.ok, "Sage"),
    opt("warn", "circle", PALETTE.warn, "Amber"),
    opt("wait", "circle", PALETTE.wait, "Blue"),
    opt("bad", "circle", PALETTE.bad, "Rose"),
    opt("vio", "circle", PALETTE.vio, "Violet"),
    opt("teal", "circle", PALETTE.teal, "Teal"),
    opt("orange", "circle", PALETTE.orange, "Orange"),
    opt("purple", "circle", PALETTE.purple, "Purple"),
  ],
};

/** The CSS token for a stored colour value, or none. */
export const colorToken = (value: unknown): string | undefined =>
  COLOR_FIELD.options?.some((o) => o.value === value) ? `var(--${value})` : undefined;

/** What the LeetCode tracker gains: the list a problem is from, its pattern, and the practice log. */
export const TRACKER_FIELDS: Field[] = [
  {
    id: "list",
    name: "List",
    type: "select",
    options: [
      opt("blind75", "list", PALETTE.vio, "Blind 75"),
      opt("neetcode150", "list", PALETTE.teal, "NeetCode 150"),
      opt("grind169", "list", PALETTE.wait, "Grind 169"),
      opt("amazon", "building", PALETTE.orange, "Amazon top"),
      opt("contest", "trophy", PALETTE.warn, "Contest"),
      opt("other", "ellipsis", PALETTE.grey, "Other"),
    ],
  },
  {
    id: "pattern",
    name: "Pattern",
    type: "select",
    options: [
      opt("two_pointers", "move-horizontal", PALETTE.teal, "Two pointers"),
      opt("sliding_window", "panel-left", PALETTE.teal, "Sliding window"),
      opt("binary_search", "search", PALETTE.wait, "Binary search"),
      opt("bfs_dfs", "git-branch", PALETTE.vio, "BFS / DFS"),
      opt("dp", "layers", PALETTE.orange, "DP"),
      opt("greedy", "zap", PALETTE.warn, "Greedy"),
      opt("heap", "triangle", PALETTE.purple, "Heap"),
      opt("trie", "network", PALETTE.purple, "Trie"),
      opt("union_find", "link", PALETTE.wait, "Union-find"),
      opt("math", "sigma", PALETTE.grey, "Math"),
      opt("other", "ellipsis", PALETTE.grey, "Other"),
    ],
  },
  { id: "url", name: "URL", type: "url" },
  { id: "attempts", name: "Attempts", type: "number" },
  { id: "minutes", name: "Minutes", type: "number" },
  { id: "review_on", name: "Review on", type: "date" },
];

type SeedDoc = {
  id: string;
  kind: Doc["kind"];
  collection?: string;
  data: Record<string, unknown>;
};

const fieldsOf = (doc: Doc | undefined): Field[] | undefined => {
  if (doc?.kind !== "collection" || doc.data._deleted === true) return undefined;
  const fields = (doc.data as unknown as CollectionData).fields;
  return Array.isArray(fields) ? fields : undefined;
};

const missing = (have: Field[], want: Field[]) =>
  want.filter((f) => !have.some((x) => x.id === f.id));

/**
 * Seed migration 19: `color` on notes and journal, the tracker fields on leetcode, and in the
 * owner's stored templates the `study` template and the learning template's tracker, each only
 * where it is missing.
 */
export function pagesMigration(get: (id: string) => Doc | undefined): SeedDoc[] {
  const docs: SeedDoc[] = [];
  const add = (id: string, want: Field[]) => {
    const have = fieldsOf(get(id));
    if (!have) return;
    const gap = missing(have, want);
    if (gap.length > 0) docs.push({ id, kind: "collection", data: { fields: [...have, ...gap] } });
  };
  add("notes", [COLOR_FIELD]);
  add("journal", [COLOR_FIELD]);
  add("leetcode", TRACKER_FIELDS);

  const settings = get("settings");
  const stored = settings?.data.projectTemplates;
  if (settings && stored && typeof stored === "object" && !Array.isArray(stored)) {
    const templates = { ...(stored as Record<string, Partial<ProjectTemplate>>) };
    let changed = false;
    if (!templates.study) {
      templates.study = DEFAULT_TEMPLATES.study as ProjectTemplate;
      changed = true;
    }
    const learning = templates.learning;
    if (learning && !learning.tracker && DEFAULT_TEMPLATES.learning?.tracker) {
      templates.learning = { ...learning, tracker: DEFAULT_TEMPLATES.learning.tracker };
      changed = true;
    }
    if (changed)
      docs.push({ id: "settings", kind: "setting", data: { projectTemplates: templates } });
  }
  return docs;
}
