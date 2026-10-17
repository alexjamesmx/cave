import type { FlowDefinition } from "../shared/flows/registry.ts";
import { LEETCODE_PROJECT } from "../shared/projects-seed.ts";

/** One fake record: an item of `collection`, written as the owner would. */
export interface SampleDoc {
  id: string;
  collection: string;
  data: Record<string, unknown>;
}

const DAY_MS = 86_400_000;

/** `day` moved by `days`, both `YYYY-MM-DD`. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

const pad = (n: number) => String(n).padStart(2, "0");

// [day of month, title, direction, category, amount, account, time]
type Line = [number, string, "income" | "expense", string, number, string, string];

// Every month repeats this ledger, with a small step per month so charts aren't flat.
const MONTHLY: Line[] = [
  [1, "Salary", "income", "salary", 38_000, "BBVA debit", "08:00"],
  [1, "Vales", "income", "vales", 3_200, "Edenred", "08:05"],
  [2, "Gym", "expense", "health", 799, "Nu card", "07:10"],
  [3, "Rent", "expense", "home", 12_500, "BBVA debit", "10:00"],
  [5, "Netflix", "expense", "subscriptions", 219, "Nu card", "06:00"],
  [6, "Groceries", "expense", "groceries", 1_180, "Nu card", "18:40"],
  [9, "Tacos with friends", "expense", "food", 320, "Nu card", "21:15"],
  [11, "Gas", "expense", "transport", 600, "BBVA debit", "08:30"],
  [13, "Groceries", "expense", "groceries", 940, "Nu card", "19:05"],
  [16, "To brokerage", "expense", "investment", 5_000, "BBVA debit", "09:00"],
  [18, "Dinner out", "expense", "food", 455, "Nu card", "20:30"],
  [20, "Groceries", "expense", "groceries", 1_325, "Nu card", "18:20"],
  [24, "Books", "expense", "learning", 389, "Nu card", "13:00"],
  [27, "Groceries", "expense", "groceries", 1_060, "Nu card", "18:55"],
];

/** Twelve months of ledger up to today: income, spending, a transfer, and one untagged entry. */
function money(today: string): SampleDoc[] {
  const docs: SampleDoc[] = [];
  const month = today.slice(0, 7);
  for (let back = 11; back >= 0; back--) {
    const m = addMonths(month, -back);
    for (const [dom, title, direction, category, base, account, time] of MONTHLY) {
      const date = `${m}-${pad(dom)}`;
      if (date > today) continue;
      // Income stays put; spending drifts a little month to month.
      const amount = direction === "income" ? base : base + ((11 - back) % 4) * 15;
      docs.push({
        id: `s-money-${date}-${category}`,
        collection: "money",
        data: {
          _title: title,
          date: `${date}T${time}`,
          amount,
          direction,
          category,
          account,
        },
      });
    }
  }
  // Left for the owner to tag, so Untagged and the review have something.
  docs.push({
    id: "s-money-untagged",
    collection: "money",
    data: {
      _title: "OXXO",
      date: `${today}T12:00`,
      amount: 87,
      direction: "expense",
      account: "Nu card",
    },
  });
  return docs;
}

function payments(today: string): SampleDoc[] {
  const p = (id: string, title: string, data: Record<string, unknown>): SampleDoc => ({
    id: `s-pay-${id}`,
    collection: "payments",
    data: { _title: title, active: true, ...data },
  });
  return [
    p("netflix", "Netflix", {
      kind: "subscription",
      amount: 219,
      category: "subscriptions",
      account: "Nu card",
      due: `${addDays(today, 5)}T09:00`,
      repeat: "monthly",
      notify_days: 2,
      autopay: true,
    }),
    p("spotify", "Spotify", {
      kind: "subscription",
      amount: 1_290,
      category: "subscriptions",
      account: "Nu card",
      due: addDays(today, 40),
      repeat: "yearly",
      notify_days: 7,
      autopay: true,
    }),
    p("nu-card", "Nu card statement", {
      kind: "card",
      amount: 6_400,
      approx: true,
      account: "BBVA debit",
      due: `${addDays(today, 12)}T10:00`,
      repeat: "monthly",
      notify_days: 3,
    }),
    p("cfe", "Electricity (CFE)", {
      kind: "bill",
      amount: 540,
      approx: true,
      category: "home",
      account: "BBVA debit",
      due: addDays(today, -1),
      repeat: "monthly",
      notify_days: 2,
    }),
    p("car-loan", "Car loan", {
      kind: "loan",
      amount: 4_200,
      category: "transport",
      account: "BBVA debit",
      due: addDays(today, 20),
      repeat: "monthly",
      notify_days: 3,
    }),
    p("old-gym", "Old gym membership", {
      kind: "subscription",
      amount: 650,
      category: "health",
      due: addDays(today, -60),
      repeat: "monthly",
      active: false,
    }),
  ];
}

const PROJECT = "s-proj-kitchen";

function projects(today: string): SampleDoc[] {
  return [
    {
      id: PROJECT,
      collection: "projects",
      data: {
        _title: "Kitchen refresh",
        status: "active",
        area: "home",
        goal: "New paint, shelves and lights before the holidays",
        template: "generic",
        pinned: true,
        review: addDays(today, 14),
      },
    },
    {
      id: "s-part-plan",
      collection: "parts",
      data: {
        _title: "Plan and budget",
        project: PROJECT,
        status: "done",
        kind: "phase",
        order: 1,
      },
    },
    {
      id: "s-part-build",
      collection: "parts",
      data: {
        _title: "Paint and shelves",
        project: PROJECT,
        status: "active",
        kind: "phase",
        order: 2,
        due: addDays(today, 21),
      },
    },
  ];
}

function tasks(today: string): SampleDoc[] {
  const t = (id: string, title: string, data: Record<string, unknown>): SampleDoc => ({
    id: `s-task-${id}`,
    collection: "tasks",
    data: { _title: title, priority: "normal", ...data },
  });
  return [
    t("passport", "Renew the passport", {
      status: "todo",
      priority: "high",
      due: `${addDays(today, 10)}T10:00`,
      area: "admin",
    }),
    t("plants", "Water the plants", {
      status: "todo",
      due: `${addDays(today, 2)}T08:00`,
      repeat: "weekly",
      notify: true,
      area: "home",
    }),
    t("bank", "Call the bank about the card fee", { status: "waiting", area: "money" }),
    t("review", "Write the quarterly review", {
      status: "doing",
      priority: "high",
      due: `${today}T17:00`,
      area: "work",
    }),
    t("dentist", "Book the dentist", {
      status: "todo",
      due: addDays(today, -1),
      area: "health",
    }),
    t("bike", "Fix the bike brakes", {
      status: "done",
      completed: `${addDays(today, -3)}T19:30`,
      area: "home",
    }),
    t("tickets", "Buy concert tickets", {
      status: "dropped",
      priority: "low",
      cancelled: `${addDays(today, -8)}T12:00`,
    }),
    t("paint", "Pick the paint colour", {
      status: "todo",
      project: PROJECT,
      part: "s-part-build",
      due: addDays(today, 4),
    }),
  ];
}

const HABITS = [
  "gym",
  "supplements",
  "reading",
  "meditation",
  "water_2l",
  "protein",
  "creatine",
  "learning",
];

/** Two weeks of journal days, each with the habits done that day. */
function journal(today: string): SampleDoc[] {
  const notes = [
    "Long walk after work; slept well.",
    "Busy day. Finished the report draft.",
    "Rest day. Cooked for the week.",
  ];
  const docs: SampleDoc[] = [];
  for (let back = 13; back >= 0; back--) {
    const date = addDays(today, -back);
    const habits = Object.fromEntries(HABITS.map((h, i) => [h, (back + i) % 3 !== 0]));
    docs.push({
      id: `s-journal-${date}`,
      collection: "journal",
      data: {
        _title: date,
        ...(back % 4 === 0 ? { _body: notes[back % notes.length] } : {}),
        date,
        ...habits,
      },
    });
  }
  return docs;
}

const IDEAS: SampleDoc[] = [
  {
    id: "s-idea-garden",
    collection: "ideas",
    data: {
      _title: "Balcony herb garden",
      stage: "spark",
      area: "home",
      next_step: "Measure the balcony",
    },
  },
  {
    id: "s-idea-budget-bot",
    collection: "ideas",
    data: {
      _title: "Weekly spending recap",
      stage: "exploring",
      area: "money",
      next_step: "Sketch what it shows",
    },
  },
  {
    id: "s-idea-shelves",
    collection: "ideas",
    data: { _title: "Floating kitchen shelves", stage: "building", project: PROJECT },
  },
];

function wealth(today: string): SampleDoc[] {
  const w = (id: string, title: string, type: string, value: number): SampleDoc => ({
    id: `s-wealth-${id}`,
    collection: "wealth",
    data: { _title: title, type, value, updated: today },
  });
  return [
    w("bbva", "BBVA debit", "liquid", 24_300),
    w("nu", "Nu savings", "liquid", 61_000),
    w("gbm", "GBM portfolio", "investments", 152_000),
    w("car", "Car", "assets", 180_000),
    w("nu-card", "Nu card balance", "debt", 6_400),
  ];
}

function leetcode(today: string): SampleDoc[] {
  const l = (
    number: number,
    title: string,
    difficulty: string,
    topic: string,
    status: string,
    solvedDaysAgo?: number,
  ): SampleDoc => ({
    id: `s-lc-${number}`,
    collection: "leetcode",
    data: {
      _title: title,
      number,
      difficulty,
      topic,
      status,
      project: LEETCODE_PROJECT,
      ...(solvedDaysAgo === undefined ? {} : { solved_at: addDays(today, -solvedDaysAgo) }),
    },
  });
  return [
    l(1, "Two Sum", "easy", "hash map", "solved", 20),
    l(3, "Longest Substring Without Repeating Characters", "medium", "sliding window", "solved", 6),
    l(200, "Number of Islands", "medium", "graphs", "practicing"),
    l(42, "Trapping Rain Water", "hard", "two pointers", "queued"),
  ];
}

function reminders(today: string): SampleDoc[] {
  const r = (id: string, title: string, data: Record<string, unknown>): SampleDoc => ({
    id: `s-rem-${id}`,
    collection: "reminders",
    data: { _title: title, done: false, ...data },
  });
  return [
    r("recycling", "Take out the recycling", {
      due: `${addDays(today, 1)}T20:00`,
      repeat: "weekly",
    }),
    r("birthday", "Mum's birthday", { due: addDays(today, 25), repeat: "yearly" }),
    r("insurance", "Renew the car insurance", { due: `${today}T18:00`, repeat: "none" }),
    r("filter", "Change the water filter", {
      due: addDays(today, -2),
      repeat: "monthly",
      done: true,
    }),
  ];
}

const MONTHLY_REVIEW: FlowDefinition = {
  version: 1,
  trigger: { type: "schedule", every: "month", day: 1, at: "08:00" },
  steps: [{ type: "create", collection: "tasks", title: "Review last month's spending" }],
};

const OTHER: SampleDoc[] = [
  {
    id: "s-flow-review",
    collection: "flows",
    data: {
      _title: "Monthly spending review",
      _body: "On the 1st: a task to look back at last month.",
      status: "off",
      definition: MONTHLY_REVIEW,
      author: "owner",
    },
  },
  {
    id: "s-proposal-garden",
    collection: "proposals",
    data: {
      _title: "Delete Balcony herb garden",
      target: "s-idea-garden",
      action: "delete",
      reason: "No progress in three months",
      agent: "claude",
      status: "pending",
    },
  },
  {
    id: "s-ai-agents-md",
    collection: "ai",
    data: {
      _title: "AGENTS.md",
      _body: "Project rules for every agent working in this repo.",
      kind: "rule",
      surface: "any",
      scope: "repo",
      source: "repo:AGENTS.md",
      status: "active",
    },
  },
  {
    id: "s-ai-github-mcp",
    collection: "ai",
    data: {
      _title: "GitHub MCP server",
      _body: "Issues, pull requests and Actions.",
      kind: "mcp-server",
      surface: "claude-code",
      scope: "repo",
      source: "repo:.mcp.json",
      status: "active",
    },
  },
];

/**
 * Fake, realistic records for every collection, dated from `today` (the owner's local date)
 * so this month, Payments and the calendar always have content. No randomness: the same day
 * gives the same records. Parents come before what refers to them.
 */
/** One finished and one running agent run on the kitchen project, so Activity has both. */
function runs(today: string): SampleDoc[] {
  const at = (time: string) => `${today}T${time}:00`;
  const utc = (time: string) => `${today}T${time}:00.000Z`;
  return [
    {
      id: "s-run-plan",
      collection: "runs",
      data: {
        _title: "Plan the shelves",
        _body: "Measured the wall and listed the parts to buy.",
        project: PROJECT,
        part: "s-part-plan",
        agent: "claude",
        status: "done",
        started_at: at("09:00"),
        finished_at: at("09:20"),
        steps: [
          { title: "Read the project", status: "done", at: utc("15:00") },
          {
            title: "Listed the parts",
            status: "done",
            detail: "4 brackets, 2 boards",
            at: utc("15:10"),
          },
        ],
      },
    },
    {
      id: "s-run-build",
      collection: "runs",
      data: {
        _title: "Pick the paint",
        project: PROJECT,
        part: "s-part-build",
        agent: "claude",
        status: "running",
        started_at: at("10:00"),
        steps: [{ title: "Compare three colours", status: "running", at: utc("16:00") }],
      },
    },
  ];
}

export function sampleDocs(today: string, createdAt: string): SampleDoc[] {
  return [
    ...projects(today),
    ...money(today),
    ...payments(today),
    ...tasks(today),
    ...journal(today),
    ...IDEAS,
    ...wealth(today),
    ...leetcode(today),
    ...reminders(today),
    ...runs(today),
    ...OTHER,
  ].map((d) => ({ ...d, data: { _created: createdAt, ...d.data } }));
}
