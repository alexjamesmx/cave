import type { FlowDefinition } from "./registry.ts";

// Kept apart from `seed.ts`, which the app bundles: these hold example figures, and only the
// server's seed reads them.

const rent: FlowDefinition = {
  version: 1,
  trigger: { type: "schedule", every: "month", day: 22, at: "09:00" },
  steps: [
    { type: "create", collection: "tasks", title: "Pay rent", fields: { priority: "high" } },
    { type: "notify", title: "Pay rent", open: "created-item" },
  ],
};

const salary: FlowDefinition = {
  version: 1,
  trigger: {
    type: "item-added",
    collection: "money",
    where: [{ field: "direction", op: "=", value: "income" }],
  },
  steps: [
    { type: "if", all: [{ field: "amount", op: ">=", value: 15000 }] },
    { type: "create", collection: "tasks", title: "Move {{item.amount|pct:20}} to invest" },
  ],
};

/** Drafts from the design, off, for the owner to set the real day and amounts first. */
export const SEEDED_FLOWS = [
  {
    id: "flow-rent",
    data: {
      _title: "Rent reminder",
      _body: "Every month on the 22nd: a task to pay rent, and a notification.",
      status: "draft",
      definition: rent,
      author: "owner",
    },
  },
  {
    id: "flow-salary",
    data: {
      _title: "Salary → save",
      _body: "When a large income arrives: a task to move 20% to investments.",
      status: "draft",
      definition: salary,
      author: "owner",
    },
  },
];
