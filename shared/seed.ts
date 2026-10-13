import { SEED_STAMP } from "./hlc.ts";
import type { CollectionData, Field, FieldType, SelectOption, View, ViewType } from "./schema.ts";
import type { Doc } from "./types.ts";

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
  ["meditation", "Meditation", "lotus"],
  ["water_2l", "Water 2 L", "droplet"],
  ["protein", "Protein", "egg"],
  ["creatine", "Creatine", "flask"],
  ["learning", "Learning", "graduation-cap"],
];

const COLLECTIONS: Record<string, CollectionData> = {
  money: {
    name: "Money",
    icon: "wallet",
    color: C.income,
    order: 0,
    fields: [
      field("date", "Date", "date"),
      field("amount", "Amount", "money"),
      field("direction", "Direction", "select", [
        opt("income", "arrow-down-left", C.income),
        opt("expense", "arrow-up-right", C.expense),
      ]),
      field("category", "Category", "select", [
        opt("food", "utensils", C.orange),
        opt("home", "home", C.violet),
        opt("transport", "car", C.cyan),
        opt("health", "heart-pulse", C.expense),
        opt("fun", "sparkles", C.purple),
        opt("other", "dots", C.grey),
        opt("investment", "trending-up", C.gold),
        opt("income", "coins", C.income),
        opt("transfer", "arrows-left-right", C.lime),
      ]),
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
    icon: "check-square",
    color: C.lime,
    order: 1,
    fields: [
      field("status", "Status", "select", [
        opt("todo", "circle", C.grey),
        opt("doing", "circle-half", C.cyan),
        opt("waiting", "hourglass", C.gold),
        opt("done", "circle-check", C.lime),
        opt("dropped", "circle-x", C.expense),
      ]),
      field("priority", "Priority", "select", [
        opt("high", "chevrons-up", C.expense),
        opt("normal", "minus", C.grey),
        opt("low", "chevrons-down", C.cyan),
      ]),
      field("due", "Due", "date"),
      field("area", "Area", "text"),
      field("completed", "Completed", "date"),
      field("cancelled", "Cancelled", "date"),
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
        opt("house", "home", C.cyan),
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
      // Options are left for the owner or the importer to fill; the plan does not name them.
      field("status", "Status", "select", []),
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
      field("due", "Due", "date"),
      field("repeat", "Repeat", "text"),
      field("done", "Done", "checkbox"),
    ],
    views: [
      view("table", "Table", "table"),
      view("calendar", "Calendar", "calendar", { dateField: "due" }),
    ],
  },
};

/** Seed collections stamped at time 0, so any edit from a device wins. */
export function seedDocs(): Doc[] {
  return Object.entries(COLLECTIONS).map(([id, collection]) => {
    const data: Record<string, unknown> = structuredClone(collection);
    const stamps = Object.fromEntries(Object.keys(data).map((key) => [key, SEED_STAMP]));
    return { id, kind: "collection", collection: null, data, stamps, actor: "seed" };
  });
}
