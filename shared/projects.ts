import type { CollectionData, Field, SelectOption } from "./schema.ts";
import type { Doc } from "./types.ts";

/**
 * Projects as workspaces (M8 part 2): a project has a goal, parts (nested), tasks and items of
 * any collection linked by a `project` ref. Templates are data in `settings.projectTemplates`,
 * which the owner or AI can edit; these are the defaults.
 */

export const PROJECTS = "projects";
export const PARTS = "parts";

export const WIDGETS = ["progress", "budget", "board", "timeline", "runs", "counts"] as const;
export type Widget = (typeof WIDGETS)[number];

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

export const PART_STATUSES = ["planned", "active", "blocked", "done", "dropped"] as const;

export const PARTS_COLLECTION: CollectionData = {
  name: "Parts",
  icon: "layers",
  color: "#8B7CFF",
  order: 10,
  fields: [
    { id: "project", name: "Project", type: "ref", config: { collection: PROJECTS } },
    { id: "parent", name: "Parent", type: "ref", config: { collection: PARTS } },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        opt("planned", "circle", "#8C93A0"),
        opt("active", "circle-dot", "#3DE0FF"),
        opt("blocked", "octagon-alert", "#FF5C7A"),
        opt("done", "circle-check", "#B6FF3B"),
        opt("dropped", "circle-x", "#8C93A0"),
      ],
    },
    { id: "order", name: "Order", type: "number" },
    { id: "due", name: "Due", type: "date" },
    {
      id: "kind",
      name: "Kind",
      type: "select",
      options: [
        opt("milestone", "flag", "#F5C451"),
        opt("component", "box", "#3DE0FF"),
        opt("phase", "milestone", "#8B7CFF"),
        opt("other", "ellipsis", "#8C93A0"),
      ],
    },
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};

/** What projects gain; `map` arrives with the Map (part 3). */
export const PROJECT_FIELDS: Field[] = [
  { id: "goal", name: "Goal", type: "text" },
  {
    id: "template",
    name: "Template",
    type: "select",
    options: Object.keys(DEFAULT_TEMPLATES).map((t) => opt(t, "layout-template", "#C77DFF")),
  },
  { id: "pinned", name: "Pinned", type: "checkbox" },
];

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

/** Expenses linked to the project, for the `budget` widget; transfers excluded. */
export function projectBudget(money: Doc[], transfers: ReadonlySet<string>) {
  let spent = 0;
  let count = 0;
  for (const d of money) {
    if (d.data._deleted === true || d.data.direction !== "expense") continue;
    if (typeof d.data.amount !== "number") continue;
    if (typeof d.data.category === "string" && transfers.has(d.data.category)) continue;
    spent += d.data.amount;
    count += 1;
  }
  return { spent, count };
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

/** What a provider is asked about a project; ids let an agent call `get_project`. */
export function projectPrompt(project: Doc, question: string): string {
  const title = String(project.data._title ?? "Untitled");
  return `About my Cave project "${title}" (id ${project.id}; call get_project for its parts, tasks and items): ${question}`;
}

/** What a provider is asked to start an idea. */
export function ideaPrompt(idea: Doc): string {
  const title = String(idea.data._title ?? "Untitled");
  const body = typeof idea.data._body === "string" ? idea.data._body.trim() : "";
  return `Help me start my idea "${title}" (Cave item ${idea.id})${body ? `:\n\n${body}\n\n` : ". "}Suggest a goal, the first parts and the first three tasks.`;
}

export interface Upcoming {
  id: string;
  title: string;
  due: string;
  kind: "part" | "task";
}

/** Everything an Overview's widgets show, from the items linked to one project. */
export interface ProjectOverview {
  progress: { done: number; total: number; of: string };
  budget: { spent: number; count: number };
  tasks: { status: string; count: number }[];
  upcoming: Upcoming[];
  counts: { collection: string; count: number }[];
  flows: Doc[];
}

const CLOSED = new Set(["done", "dropped"]);

export function overviewOf(
  project: string,
  template: ProjectTemplate | undefined,
  itemsOf: (collection: string) => Doc[],
  transfers: ReadonlySet<string>,
): ProjectOverview {
  const of = (c: string) => linkedTo(itemsOf(c), project);
  const parts = of(PARTS);
  const tasks = of("tasks");
  const spec = template?.progress;
  const progress = spec
    ? { ...progressBy(of(spec.collection), spec.field, spec.done), of: spec.collection }
    : { ...partProgress(parts), of: PARTS };
  const byStatus = new Map<string, number>();
  for (const t of tasks) {
    const s = typeof t.data.status === "string" ? t.data.status : "none";
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  const upcoming: Upcoming[] = [
    ...parts.map((d) => ({ d, kind: "part" as const })),
    ...tasks.map((d) => ({ d, kind: "task" as const })),
  ]
    .filter(({ d }) => typeof d.data.due === "string" && !CLOSED.has(String(d.data.status)))
    .map(({ d, kind }) => ({
      id: d.id,
      title: String(d.data._title ?? "Untitled"),
      due: d.data.due as string,
      kind,
    }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return {
    progress: { done: progress.done, total: progress.total, of: progress.of },
    budget: projectBudget(of("money"), transfers),
    tasks: [...byStatus].map(([status, count]) => ({ status, count })),
    upcoming,
    counts: (template?.collections ?? []).map((c) => ({ collection: c, count: of(c).length })),
    flows: of("flows"),
  };
}
