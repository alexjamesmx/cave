import { mergeCategoryOptions } from "./categories.ts";
import { diaryMigration } from "./diary.ts";
import { builtInFlows, builtInFlowsMigration } from "./flows/built-in.ts";
import { SEEDED_FLOWS } from "./flows/drafts.ts";
import { FLOWS, FLOWS_COLLECTION } from "./flows/seed.ts";
import { SEED_STAMP } from "./hlc.ts";
import { listsMigration, MONEY_ACCOUNT } from "./lists.ts";
import { NOTES, NOTES_COLLECTION, notesMigration } from "./notes.ts";
import { DEFAULT_NOTIFICATIONS } from "./notifications.ts";
import { COLOR_FIELD, pagesMigration, TRACKER_FIELDS } from "./pages.ts";
import { PALETTE, recolour } from "./palette.ts";
import {
  MONEY_PAYMENT_REF,
  PAYMENTS,
  PAYMENTS_COLLECTION,
  paymentLinkMigration,
  TASK_FIELDS,
} from "./payments.ts";
import { mapMigration } from "./project-map.ts";
import { DEFAULT_TEMPLATES, PARTS, PARTS_COLLECTION, projectPageMigration } from "./projects.ts";
import {
  LEETCODE_PROJECT,
  LEETCODE_PROJECT_DATA,
  projectsMigration,
  withProjectFields,
} from "./projects-seed.ts";
import { RADAR, RADAR_COLLECTION, radarMigration } from "./radar.ts";
import { DEFAULT_REMINDER_TIME } from "./reminders.ts";
import { RUNS, RUNS_COLLECTION, runsMigration } from "./runs.ts";
import type { CollectionData, Field, FieldType, SelectOption, View, ViewType } from "./schema.ts";
import { tasksCalendarMigration } from "./tasks.ts";
import type { Doc, Kind } from "./types.ts";

const AI = "ai";

const C = {
  lime: PALETTE.ok,
  income: PALETTE.ok,
  expense: PALETTE.bad,
  cyan: PALETTE.teal,
  violet: PALETTE.vio,
  gold: PALETTE.warn,
  orange: PALETTE.orange,
  purple: PALETTE.purple,
  grey: PALETTE.grey,
};

const opt = (value: string, icon: string, color: string): SelectOption => ({ value, icon, color });

function field(id: string, name: string, type: FieldType, options?: SelectOption[]): Field {
  return options ? { id, name, type, options } : { id, name, type };
}

const dateTime = (id: string, name: string): Field => ({
  id,
  name,
  type: "date",
  config: { withTime: true },
});

const view = (
  id: string,
  name: string,
  type: ViewType,
  config: Record<string, unknown> = {},
): View => ({
  id,
  name,
  type,
  config,
});

const HABITS: [string, string, string][] = [
  ["gym", "Gym", "dumbbell"],
  ["supplements", "Supplements", "pill"],
  ["reading", "Reading", "book"],
  ["meditation", "Meditation", "flower-2"],
  ["water_2l", "Water 2 L", "droplet"],
  ["protein", "Protein", "egg"],
  ["creatine", "Creatine", "flask-conical"],
  ["learning", "Learning", "graduation-cap"],
];

// The categories money had before M7b; the set in `categories.ts` is merged onto them.
const LEGACY_CATEGORIES: SelectOption[] = [
  opt("food", "utensils", C.orange),
  opt("home", "house", C.violet),
  opt("transport", "car", C.cyan),
  opt("health", "heart-pulse", C.expense),
  opt("fun", "sparkles", C.purple),
  opt("other", "ellipsis", C.grey),
  opt("investment", "trending-up", C.gold),
  opt("income", "coins", C.income),
  opt("transfer", "arrow-left-right", C.lime),
];

const COLLECTIONS: Record<string, CollectionData> = {
  money: {
    name: "Money",
    icon: "wallet",
    color: C.income,
    order: 0,
    fields: [
      dateTime("date", "Date"),
      field("amount", "Amount", "money"),
      field("direction", "Direction", "select", [
        opt("income", "arrow-down-left", C.income),
        opt("expense", "arrow-up-right", C.expense),
      ]),
      field("category", "Category", "select", mergeCategoryOptions(LEGACY_CATEGORIES)),
      // Archived by M7c: old values stay and show read-only in the drawer.
      { ...field("detail", "Detail", "text"), archived: true },
      MONEY_ACCOUNT,
      MONEY_PAYMENT_REF,
    ],
    views: [
      view("dashboard", "Dashboard", "money"),
      view("table", "Table", "table"),
      view("untagged", "Untagged", "table", { filter: { field: "category", op: "empty" } }),
    ],
  },
  tasks: {
    name: "Tasks",
    icon: "square-check",
    color: C.lime,
    order: 1,
    fields: [
      field("status", "Status", "select", [
        opt("todo", "circle", C.grey),
        opt("doing", "circle-dot", C.cyan),
        opt("waiting", "hourglass", C.gold),
        opt("done", "circle-check", C.lime),
        opt("dropped", "circle-x", C.expense),
      ]),
      field("priority", "Priority", "select", [
        opt("high", "chevrons-up", C.expense),
        opt("normal", "minus", C.grey),
        opt("low", "chevrons-down", C.cyan),
      ]),
      dateTime("due", "Due"),
      field("area", "Area", "text"),
      dateTime("completed", "Completed"),
      dateTime("cancelled", "Cancelled"),
      ...TASK_FIELDS,
    ],
    views: [
      view("board", "Board", "board", { groupBy: "status" }),
      view("table", "Table", "table"),
    ],
  },
  journal: {
    name: "Journal",
    icon: "notebook",
    color: C.violet,
    order: 2,
    fields: [
      field("date", "Date", "date"),
      ...HABITS.map(([id, name]) => field(id, name, "checkbox")),
      COLOR_FIELD,
    ],
    views: [view("write", "Write", "write")],
  },
  ideas: {
    name: "Ideas",
    icon: "lightbulb",
    color: C.gold,
    order: 3,
    fields: [
      field("stage", "Stage", "select", [
        opt("spark", "sparkles", C.gold),
        opt("exploring", "compass", C.cyan),
        opt("building", "hammer", C.lime),
        opt("parked", "pause", C.grey),
      ]),
      field("area", "Area", "text"),
      field("next_step", "Next step", "text"),
    ],
    views: [
      view("table", "Table", "table"),
      view("board", "Board", "board", { groupBy: "stage" }),
      view("gallery", "Gallery", "gallery"),
    ],
  },
  wealth: {
    name: "Wealth",
    icon: "landmark",
    color: C.cyan,
    order: 4,
    fields: [
      field("type", "Type", "select", [
        opt("liquid", "banknote", C.income),
        opt("investments", "trending-up", C.gold),
        opt("stocks", "chart-candlestick", C.violet),
        opt("house", "house", C.cyan),
        opt("assets", "package", C.purple),
        opt("debt", "credit-card", C.expense),
      ]),
      field("value", "Value", "money"),
      field("updated", "Updated", "date"),
    ],
    views: [view("dashboard", "Dashboard", "wealth"), view("table", "Table", "table")],
  },
  leetcode: {
    name: "LeetCode",
    icon: "code",
    color: C.orange,
    order: 5,
    fields: [
      field("number", "Number", "number"),
      field("difficulty", "Difficulty", "select", [
        opt("easy", "signal-low", C.income),
        opt("medium", "signal-medium", C.gold),
        opt("hard", "signal-high", C.expense),
      ]),
      field("topic", "Topic", "text"),
      field("status", "Status", "select", [
        opt("queued", "list", C.grey),
        opt("practicing", "repeat", C.cyan),
        opt("review", "eye", C.gold),
        opt("solved", "circle-check", C.lime),
        opt("skipped", "skip-forward", C.expense),
      ]),
      field("solved_at", "Solved", "date"),
      field("notes", "Notes", "text"),
      ...TRACKER_FIELDS,
    ],
    views: [view("progress", "Progress", "progress"), view("table", "Table", "table")],
  },
  projects: {
    name: "Projects",
    icon: "folder-kanban",
    color: C.purple,
    order: 6,
    fields: [
      field("status", "Status", "select", [
        opt("active", "play", C.lime),
        opt("paused", "pause", C.gold),
        opt("done", "circle-check", C.cyan),
        opt("dropped", "circle-x", C.expense),
      ]),
      field("area", "Area", "text"),
      field("review", "Review", "date"),
    ],
    views: [
      view("table", "Table", "table"),
      view("board", "Board", "board", { groupBy: "status" }),
    ],
  },
  reminders: {
    name: "Reminders",
    icon: "bell",
    color: C.expense,
    order: 7,
    fields: [
      dateTime("due", "Due"),
      field("repeat", "Repeat", "select", [
        opt("none", "ban", C.grey),
        opt("daily", "sun", C.cyan),
        opt("weekly", "calendar-days", C.violet),
        opt("monthly", "calendar", C.gold),
        opt("yearly", "calendar-range", C.purple),
      ]),
      field("done", "Done", "checkbox"),
    ],
    views: [
      view("table", "Table", "table"),
      view("calendar", "Calendar", "calendar", { dateField: "due" }),
    ],
  },
};

/**
 * Delete proposals from agents. The owner decides on them from the Agents page, so the
 * collection stays out of navigation. Added after real databases may exist, so it also
 * ships as seed migration 2.
 */
const PROPOSALS: CollectionData = {
  name: "Proposals",
  icon: "gavel",
  color: C.gold,
  order: 8,
  hidden: true,
  fields: [
    field("target", "Target", "text"),
    field("action", "Action", "select", [opt("delete", "trash", C.expense)]),
    field("reason", "Reason", "text"),
    field("agent", "Agent", "text"),
    field("status", "Status", "select", [
      opt("pending", "hourglass", C.gold),
      opt("approved", "circle-check", C.lime),
      opt("declined", "circle-x", C.grey),
    ]),
    dateTime("decided", "Decided"),
  ],
  views: [view("table", "Table", "table")],
};

/** A change to seeded docs after real databases exist; applied once, in version order. */
interface SeedMigration {
  version: number;
  docs: { id: string; kind: Kind; collection?: string; data: Record<string, unknown> }[];
  /**
   * Docs computed from what the database holds now, for changes that must merge with the
   * owner's edits (a field's options) rather than replace them.
   */
  update?: (
    get: (id: string) => Doc | undefined,
    items: (collection: string) => Doc[],
    now: string,
  ) => SeedMigration["docs"];
}

/**
 * M7b part 6: tasks repeat and can notify, and their `due` takes a time; payments arrive.
 * Fields the owner already has keep their settings; only missing ones are added.
 */
function repeatingTasksAndPayments(get: (id: string) => Doc | undefined): SeedMigration["docs"] {
  const docs: SeedMigration["docs"] = [];
  const tasks = get("tasks");
  const fields = (tasks?.data as unknown as CollectionData | undefined)?.fields;
  if (tasks?.kind === "collection" && tasks.data._deleted !== true && Array.isArray(fields)) {
    const next = [
      ...fields.map((f) =>
        f.id === "due" && f.type === "date" ? { ...f, config: { ...f.config, withTime: true } } : f,
      ),
      ...TASK_FIELDS.filter((t) => !fields.some((f) => f.id === t.id)),
    ];
    docs.push({ id: "tasks", kind: "collection", data: { fields: next } });
  }
  if (!get(PAYMENTS)) docs.push({ id: PAYMENTS, kind: "collection", data: PAYMENTS_COLLECTION });
  return docs;
}

/** M7b part 5: the money categories gain emoji, labels and kinds, and the new set is added. */
function mergeMoneyCategories(get: (id: string) => Doc | undefined): SeedMigration["docs"] {
  const money = get("money");
  if (money?.kind !== "collection" || money.data._deleted === true) return [];
  const fields = (money.data as unknown as CollectionData).fields;
  if (!Array.isArray(fields) || !fields.some((f) => f.id === "category")) return [];
  return [
    {
      id: "money",
      kind: "collection",
      data: {
        fields: fields.map((f) =>
          f.id === "category" ? { ...f, options: mergeCategoryOptions(f.options ?? []) } : f,
        ),
      },
    },
  ];
}

/** Settings keys no code reads since M12: the radar's interests and the subscription finder's dismissals. */
const RETIRED_SETTINGS = ["radarInterests", "dismissedSubscriptions"];

/**
 * Seed migration 22: those keys are cleared (set to null, as the app clears a setting), so the
 * owner's settings hold only what something uses. The values stay in the change history.
 */
export function retiredSettingsMigration(
  get: (id: string) => Doc | undefined,
): SeedMigration["docs"] {
  const settings = get("settings");
  if (settings?.kind !== "setting") return [];
  const set = RETIRED_SETTINGS.filter(
    (k) => settings.data[k] !== undefined && settings.data[k] !== null,
  );
  return set.length === 0
    ? []
    : [{ id: "settings", kind: "setting", data: Object.fromEntries(set.map((k) => [k, null])) }];
}

/**
 * M10: the Cave is not an AI tool. The `ai` collection (M7b part 8, filled by `ai-sync`) and
 * every live item in it are marked deleted, never removed: they stay in every copy and in
 * backups, and undo still works. Runs again on what it produced: nothing left to do.
 */
export function retireAiMigration(
  get: (id: string) => Doc | undefined,
  items: (collection: string) => Doc[],
): SeedMigration["docs"] {
  const collection = get(AI);
  if (!collection || collection.data._deleted === true) return [];
  return [
    { id: AI, kind: "collection", data: { _deleted: true } },
    ...items(AI).map((d) => ({
      id: d.id,
      kind: "item" as const,
      collection: AI,
      data: { _deleted: true },
    })),
  ];
}

// Every collection the seed has ever created; the recolouring touches no other doc.
const SEEDED_COLLECTIONS = [
  "money",
  "tasks",
  "journal",
  "ideas",
  "wealth",
  "leetcode",
  "projects",
  "reminders",
  "proposals",
  "flows",
  "payments",
  "parts",
  "notes",
  "radar",
  "runs",
];

/**
 * M11 part 1: palette A. A collection's colour and its options' colours that still equal a
 * retired seed colour become the palette colour; anything the owner changed to another value
 * stays. `fields` is one key, so the whole array is written back from what the database holds.
 */
export function recolourMigration(get: (id: string) => Doc | undefined): SeedMigration["docs"] {
  const docs: SeedMigration["docs"] = [];
  for (const id of SEEDED_COLLECTIONS) {
    const doc = get(id);
    if (doc?.kind !== "collection" || doc.data._deleted === true) continue;
    const data: Record<string, unknown> = {};
    const color = recolour(doc.data.color);
    if (color !== doc.data.color) data.color = color;
    const fields = (doc.data as unknown as CollectionData).fields;
    if (Array.isArray(fields)) {
      let changed = false;
      const next = fields.map((f) => {
        if (!Array.isArray(f.options)) return f;
        const options = f.options.map((o) => {
          const c = recolour(o.color);
          if (c === o.color) return o;
          changed = true;
          return { ...o, color: c as string };
        });
        return changed ? { ...f, options } : f;
      });
      if (changed) data.fields = next;
    }
    if (Object.keys(data).length > 0) docs.push({ id, kind: "collection", data });
  }
  return docs;
}

// Flows (M7 Part C): the collection and two drafts, as one migration so they arrive together.
const FLOW_DOCS: SeedMigration["docs"] = [
  { id: FLOWS, kind: "collection", data: FLOWS_COLLECTION },
  ...SEEDED_FLOWS.map((f) => ({
    id: f.id,
    kind: "item" as const,
    collection: FLOWS,
    data: f.data,
  })),
];

// A date-only reminder is due at this local time; the owner changes it in Settings.
const REMINDER_DEFAULTS = { reminderTime: DEFAULT_REMINDER_TIME };
// Where notifications go and how much each channel is told (M7 Part B).
const NOTIFICATION_DEFAULTS = { notifications: DEFAULT_NOTIFICATIONS };

export const SEED_MIGRATIONS: SeedMigration[] = [
  { version: 2, docs: [{ id: "proposals", kind: "collection", data: PROPOSALS }] },
  { version: 3, docs: [{ id: "settings", kind: "setting", data: REMINDER_DEFAULTS }] },
  { version: 4, docs: [{ id: "settings", kind: "setting", data: NOTIFICATION_DEFAULTS }] },
  { version: 5, docs: FLOW_DOCS },
  { version: 6, docs: [], update: mergeMoneyCategories },
  { version: 7, docs: [], update: repeatingTasksAndPayments },
  // M7b part 8 created the `ai` collection; M10 retired it (16), so a database that never had
  // it gets nothing here.
  { version: 8, docs: [] },
  // M8 part 2: project refs, parts, templates, and the LeetCode and Cave projects.
  { version: 9, docs: [], update: projectsMigration },
  // M7c part 3: accounts as a select, payments share money's lists, detail archived.
  { version: 10, docs: [], update: listsMigration },
  // M7c part 6: money's `payment` ref, so subscription charges link to their payment.
  { version: 11, docs: [], update: paymentLinkMigration },
  // M8 part 3: a project's whiteboard, kept in its `map` key.
  { version: 12, docs: [], update: mapMigration },
  // M8 part 4: runs, the trace of AI work.
  { version: 13, docs: [], update: runsMigration },
  // M9 part A: notes live in the Cave.
  { version: 14, docs: [], update: notesMigration },
  // M9 part B: the radar, fed by agents, ranked by the owner's interests.
  { version: 15, docs: [], update: radarMigration },
  // M10: the `ai` collection and its items are deleted; the Cave is not an AI tool.
  { version: 16, docs: [], update: retireAiMigration },
  // M11 part 1: palette A replaces the neon seed colours still in place.
  { version: 17, docs: [], update: recolourMigration },
  // M11 part 6: the project page's `lives_in` and `diagram` fields.
  { version: 18, docs: [], update: projectPageMigration },
  // M12 part 6: a colour on notes and diary days, the tracker fields, the study template.
  { version: 19, docs: [], update: pagesMigration },
  // M12 part 8: the diary's Habits and Gallery views retire; habit icons become a setting.
  { version: 20, docs: [], update: diaryMigration },
  // M12 part 9: Tasks → Calendar retires; Calendar → Month shows tasks already.
  { version: 21, docs: [], update: tasksCalendarMigration },
  // M12 cleanup: settings nothing reads any more are cleared.
  { version: 22, docs: [], update: retiredSettingsMigration },
  // Everything the Cave does on its own is a flow: reminders, payments, the budget, the digest.
  { version: 23, docs: [], update: builtInFlowsMigration },
];

/** A fresh seed already holds every migration; databases seeded before migrations are 1. */
export const SEED_VERSION = Math.max(1, ...SEED_MIGRATIONS.map((m) => m.version));

// Reminders and the daily brief resolve local date-times through this timezone.
const SETTINGS = {
  timezone: "America/Mexico_City",
  projectTemplates: DEFAULT_TEMPLATES,
  habitIcons: Object.fromEntries(HABITS.map(([id, , icon]) => [id, icon])),
  ...REMINDER_DEFAULTS,
  ...NOTIFICATION_DEFAULTS,
  seedVersion: SEED_VERSION,
};

const seeded = (
  id: string,
  kind: Kind,
  data: Record<string, unknown>,
  collection: string | null = null,
): Doc => ({
  id,
  kind,
  collection,
  data: structuredClone(data),
  stamps: Object.fromEntries(Object.keys(data).map((key) => [key, SEED_STAMP])),
  actor: "seed",
});

/** Seed collections and settings stamped at time 0, so any edit from a device wins. */
/** A collection as a fresh seed has it: with the M8 project fields. */
const withProjects = (id: string, data: CollectionData): CollectionData => ({
  ...data,
  fields: withProjectFields(id, data.fields),
});

export function seedDocs(): Doc[] {
  return [
    ...Object.entries(COLLECTIONS).map(([id, data]) =>
      seeded(id, "collection", withProjects(id, data)),
    ),
    seeded("proposals", "collection", PROPOSALS),
    seeded(PAYMENTS, "collection", withProjects(PAYMENTS, PAYMENTS_COLLECTION)),
    seeded(PARTS, "collection", PARTS_COLLECTION),
    seeded(RUNS, "collection", RUNS_COLLECTION),
    seeded(NOTES, "collection", NOTES_COLLECTION),
    seeded(RADAR, "collection", RADAR_COLLECTION),
    // LeetCode is a project from the start, so its old link always has somewhere to go.
    seeded(LEETCODE_PROJECT, "item", LEETCODE_PROJECT_DATA, "projects"),
    ...FLOW_DOCS.map((d) =>
      seeded(
        d.id,
        d.kind,
        d.id === FLOWS ? withProjects(FLOWS, d.data as unknown as CollectionData) : d.data,
        d.collection ?? null,
      ),
    ),
    ...builtInFlows().map((f) => seeded(f.id, f.kind, f.data, f.collection)),
    seeded("settings", "setting", SETTINGS),
  ];
}
