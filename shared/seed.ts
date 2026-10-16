import { mergeCategoryOptions } from "./categories.ts";
import { SEEDED_FLOWS } from "./flows/drafts.ts";
import { FLOWS, FLOWS_COLLECTION } from "./flows/seed.ts";
import { SEED_STAMP } from "./hlc.ts";
import { DEFAULT_NOTIFICATIONS } from "./notifications.ts";
import { PAYMENTS, PAYMENTS_COLLECTION, TASK_FIELDS } from "./payments.ts";
import { DEFAULT_REMINDER_TIME } from "./reminders.ts";
import type { CollectionData, Field, FieldType, SelectOption, View, ViewType } from "./schema.ts";
import type { Doc, Kind } from "./types.ts";

const C = {
  lime: "#B6FF3B",
  income: "#2EE6A6",
  expense: "#FF5C7A",
  cyan: "#3DE0FF",
  violet: "#8B7CFF",
  gold: "#F5C451",
  orange: "#FF9F43",
  purple: "#C77DFF",
  grey: "#8C93A0",
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
      field("detail", "Detail", "text"),
      field("account", "Account", "text"),
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
      view("calendar", "Calendar", "calendar", { dateField: "due" }),
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
    ],
    views: [
      view("write", "Write", "write"),
      view("gallery", "Gallery", "gallery"),
      view("habits", "Habits", "habits", { habits: HABITS.map(([id, , icon]) => ({ id, icon })) }),
    ],
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
export interface SeedMigration {
  version: number;
  docs: { id: string; kind: Kind; collection?: string; data: Record<string, unknown> }[];
  /**
   * Docs computed from what the database holds now, for changes that must merge with the
   * owner's edits (a field's options) rather than replace them.
   */
  update?: (get: (id: string) => Doc | undefined) => SeedMigration["docs"];
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
];

/** A fresh seed already holds every migration; databases seeded before migrations are 1. */
export const SEED_VERSION = Math.max(1, ...SEED_MIGRATIONS.map((m) => m.version));

// Reminders and the daily brief resolve local date-times through this timezone.
const SETTINGS = {
  timezone: "America/Mexico_City",
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
export function seedDocs(): Doc[] {
  return [
    ...Object.entries(COLLECTIONS).map(([id, data]) => seeded(id, "collection", data)),
    seeded("proposals", "collection", PROPOSALS),
    seeded(PAYMENTS, "collection", PAYMENTS_COLLECTION),
    ...FLOW_DOCS.map((d) => seeded(d.id, d.kind, d.data, d.collection ?? null)),
    seeded("settings", "setting", SETTINGS),
  ];
}
