import { PALETTE } from "./palette.ts";
import { MAP_FIELD } from "./project-map.ts";
import type { CollectionData, Field, SelectOption } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * Projects as workspaces (M8 part 2): a project has a goal, parts (nested), tasks and items of
 * any collection linked by a `project` ref. Templates are data in `settings.projectTemplates`,
 * which the owner or AI can edit; these are the defaults.
 */

export const PROJECTS = "projects";
export const PARTS = "parts";

const WIDGETS = ["progress", "budget", "board", "timeline", "runs", "counts"] as const;
type Widget = (typeof WIDGETS)[number];

export interface ProjectTemplate {
  label: string;
  /** Parts created with a new project. */
  parts: { title: string; kind: string }[];
  /** Collections the Items tab shows. */
  collections: string[];
  /** What the Overview shows, in order. */
  widgets: Widget[];
  /** For `progress`: the collection and its status field (default: the project's parts). */
  progress?: { collection: string; field: string; done: string[] };
  /** A tracker tab on the project page (M12 part 6): the collection and the tab's label. */
  tracker?: { collection: string; label: string };
}

export const DEFAULT_TEMPLATES: Record<string, ProjectTemplate> = {
  generic: {
    label: "Generic",
    parts: [],
    collections: ["tasks", "ideas"],
    widgets: ["counts", "board", "runs"],
  },
  software: {
    label: "Software",
    parts: [
      { title: "Plan", kind: "milestone" },
      { title: "Build", kind: "milestone" },
      { title: "Ship", kind: "milestone" },
    ],
    collections: ["tasks", "ideas", "flows"],
    widgets: ["progress", "timeline", "runs", "board"],
  },
  learning: {
    label: "Learning",
    parts: [],
    collections: ["leetcode", "tasks"],
    widgets: ["progress", "counts", "runs"],
    progress: { collection: "leetcode", field: "status", done: ["solved"] },
    tracker: { collection: "leetcode", label: "Problems" },
  },
  study: {
    label: "Study",
    parts: [],
    collections: ["tasks", "ideas"],
    widgets: ["progress", "counts", "runs"],
  },
  trip: {
    label: "Trip",
    parts: [
      { title: "Book", kind: "phase" },
      { title: "Pack", kind: "phase" },
      { title: "Go", kind: "phase" },
    ],
    collections: ["tasks", "money", "payments", "reminders"],
    widgets: ["budget", "timeline", "board"],
  },
  goal: {
    label: "Goal",
    parts: [],
    collections: ["tasks", "ideas"],
    widgets: ["progress", "timeline", "board"],
  },
};

/** `settings.projectTemplates`, read defensively: unknown or malformed ones are left out. */
export function templatesOf(
  settings: Record<string, unknown> | undefined,
): Record<string, ProjectTemplate> {
  const raw = settings?.projectTemplates;
  if (!raw || typeof raw !== "object") return DEFAULT_TEMPLATES;
  const out: Record<string, ProjectTemplate> = {};
  for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
    const v = t as Partial<ProjectTemplate> | null;
    if (
      !v ||
      typeof v.label !== "string" ||
      !Array.isArray(v.collections) ||
      !Array.isArray(v.widgets)
    )
      continue;
    out[id] = {
      label: v.label,
      parts: Array.isArray(v.parts) ? v.parts.filter((p) => p && typeof p.title === "string") : [],
      collections: v.collections.filter((c): c is string => typeof c === "string"),
      widgets: v.widgets.filter((w): w is Widget => WIDGETS.includes(w as Widget)),
      ...(v.progress ? { progress: v.progress } : {}),
      ...(v.tracker &&
      typeof v.tracker.collection === "string" &&
      typeof v.tracker.label === "string"
        ? { tracker: { collection: v.tracker.collection, label: v.tracker.label } }
        : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : DEFAULT_TEMPLATES;
}

const opt = (value: string, icon: string, color: string): SelectOption => ({ value, icon, color });

export const projectRef: Field = {
  id: "project",
  name: "Project",
  type: "ref",
  config: { collection: PROJECTS },
};

export const PARTS_COLLECTION: CollectionData = {
  name: "Parts",
  icon: "layers",
  color: PALETTE.vio,
  order: 10,
  fields: [
    { id: "project", name: "Project", type: "ref", config: { collection: PROJECTS } },
    { id: "parent", name: "Parent", type: "ref", config: { collection: PARTS } },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        opt("planned", "circle", PALETTE.grey),
        opt("active", "circle-dot", PALETTE.teal),
        opt("blocked", "octagon-alert", PALETTE.bad),
        opt("done", "circle-check", PALETTE.ok),
        opt("dropped", "circle-x", PALETTE.grey),
      ],
    },
    { id: "order", name: "Order", type: "number" },
    { id: "due", name: "Due", type: "date" },
    {
      id: "kind",
      name: "Kind",
      type: "select",
      options: [
        opt("milestone", "flag", PALETTE.warn),
        opt("component", "box", PALETTE.teal),
        opt("phase", "milestone", PALETTE.vio),
        opt("other", "ellipsis", PALETTE.grey),
      ],
    },
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};

/** The project page's own fields (M11 part 6): where the work lives, and its Mermaid diagram. */
export const PAGE_FIELDS: Field[] = [
  { id: "lives_in", name: "Lives in", type: "text" },
  { id: "diagram", name: "Diagram", type: "text" },
];

/** What projects gain (M8 parts 2 and 3, M11 part 6). */
export const PROJECT_FIELDS: Field[] = [
  { id: "goal", name: "Goal", type: "text" },
  {
    id: "template",
    name: "Template",
    type: "select",
    options: Object.keys(DEFAULT_TEMPLATES).map((t) => opt(t, "layout-template", PALETTE.purple)),
  },
  { id: "pinned", name: "Pinned", type: "checkbox" },
  MAP_FIELD,
  ...PAGE_FIELDS,
];

/** Seed migration 18: projects gain `lives_in` and `diagram` when they lack them. */
export function projectPageMigration(
  get: (id: string) => Doc | undefined,
): { id: string; kind: "collection"; data: Record<string, unknown> }[] {
  const projects = get(PROJECTS);
  const fields = projects?.kind === "collection" ? projects.data.fields : undefined;
  if (!Array.isArray(fields) || projects?.data._deleted === true) return [];
  const missing = PAGE_FIELDS.filter((f) => !(fields as Field[]).some((x) => x.id === f.id));
  if (missing.length === 0) return [];
  return [{ id: PROJECTS, kind: "collection", data: { fields: [...fields, ...missing] } }];
}

/** Collections that gain a `project` ref (notes join in M9). */
export const LINKED = ["tasks", "ideas", "leetcode", "reminders", "payments", "money", "flows"];

export const PART_FIELD: Field = {
  id: "part",
  name: "Part",
  type: "ref",
  config: { collection: PARTS },
};

/** The parts tree: each part's children, roots first, by `order` then title. */
export interface PartNode {
  doc: Doc;
  children: PartNode[];
}

export function partsTree(parts: Doc[]): PartNode[] {
  const live = parts.filter((p) => p.data._deleted !== true);
  const ids = new Set(live.map((p) => p.id));
  const sort = (a: Doc, b: Doc) =>
    (typeof a.data.order === "number" ? a.data.order : 1e9) -
      (typeof b.data.order === "number" ? b.data.order : 1e9) ||
    String(a.data._title ?? "").localeCompare(String(b.data._title ?? ""));
  const build = (parent: string | null): PartNode[] =>
    live
      .filter((p) => {
        const of =
          typeof p.data.parent === "string" && ids.has(p.data.parent) ? p.data.parent : null;
        return of === parent;
      })
      .sort(sort)
      .map((doc) => ({ doc, children: build(doc.id) }));
  return build(null);
}

/** Done parts over all parts that aren't dropped. */
export function partProgress(parts: Doc[]): { done: number; total: number } {
  const counted = parts.filter((p) => p.data._deleted !== true && p.data.status !== "dropped");
  return { done: counted.filter((p) => p.data.status === "done").length, total: counted.length };
}

/** Items by a status field, for the `progress` widget. */
export function progressBy(items: Doc[], field: string, done: string[]) {
  const live = items.filter((d) => d.data._deleted !== true);
  const byStatus = new Map<string, number>();
  for (const d of live) {
    const s = typeof d.data[field] === "string" ? (d.data[field] as string) : "none";
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  return {
    done: live.filter((d) => done.includes(String(d.data[field]))).length,
    total: live.length,
    byStatus: [...byStatus].sort((a, b) => b[1] - a[1]),
  };
}

/** One write a project action makes, in order: a part's project must exist before the part. */
export interface PlannedWrite {
  id: string;
  collection: string;
  patch: Record<string, unknown>;
}

/** A new project with its template's parts. Unknown templates make a project with none. */
export function newProjectWrites(
  input: { title: string; template: string; goal?: string },
  templates: Record<string, ProjectTemplate>,
  newId: () => string,
): PlannedWrite[] {
  const id = newId();
  const project: PlannedWrite = {
    id,
    collection: PROJECTS,
    patch: {
      _title: input.title,
      status: "active",
      template: input.template,
      ...(input.goal ? { goal: input.goal } : {}),
    },
  };
  const parts = (templates[input.template]?.parts ?? []).map((p, i) => ({
    id: newId(),
    collection: PARTS,
    patch: { _title: p.title, project: id, kind: p.kind, status: "planned", order: i + 1 },
  }));
  return [project, ...parts];
}

/** An idea becomes a project: its body is the goal, and the idea points at the project. */
export function promoteIdeaWrites(
  idea: Doc,
  template: string,
  templates: Record<string, ProjectTemplate>,
  newId: () => string,
): PlannedWrite[] {
  const body = typeof idea.data._body === "string" ? idea.data._body.trim() : "";
  const writes = newProjectWrites(
    { title: String(idea.data._title ?? "Untitled"), template, ...(body ? { goal: body } : {}) },
    templates,
    newId,
  );
  const project = writes[0] as PlannedWrite;
  return [...writes, { id: idea.id, collection: "ideas", patch: { project: project.id } }];
}

/** Items of one collection linked to a project. */
export const linkedTo = (items: Doc[], project: string) =>
  items.filter((d) => d.data._deleted !== true && d.data.project === project);

/** What Claude is asked about a project; ids let an agent call `get_project`. */
export function projectPrompt(project: Doc, question: string): string {
  const title = String(project.data._title ?? "Untitled");
  return `About my Cave project "${title}" (id ${project.id}; call get_project for its parts, tasks and items): ${question}`;
}

/** What Claude is asked to start an idea. */
export function ideaPrompt(idea: Doc): string {
  const title = String(idea.data._title ?? "Untitled");
  const body = typeof idea.data._body === "string" ? idea.data._body.trim() : "";
  return `Help me start my idea "${title}" (Cave item ${idea.id})${body ? `:\n\n${body}\n\n` : ". "}Suggest a goal, the first parts and the first three tasks.`;
}
