import type { CollectionData } from "../schema.ts";
import type { FlowDefinition } from "./registry.ts";

export const FLOWS = "flows";
export const FLOW_STATUSES = ["draft", "on", "off", "pending-approval"] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

/**
 * Automations. The Flows page (`/flows`) is how they are seen and edited, so the collection
 * stays out of the sidebar's collection list. `definition` is one value, so it merges as a
 * whole and two devices never mix halves of two flows.
 */
export const FLOWS_COLLECTION: CollectionData = {
  name: "Flows",
  icon: "workflow",
  color: "#8B7CFF",
  order: 9,
  hidden: true,
  fields: [
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        { value: "draft", icon: "pencil", color: "#8C93A0" },
        { value: "on", icon: "circle-play", color: "#2EE6A6" },
        { value: "off", icon: "circle-pause", color: "#8C93A0" },
        { value: "pending-approval", icon: "hourglass", color: "#F5C451" },
      ],
    },
    { id: "definition", name: "Definition", type: "json", config: { schema: "flow" } },
    { id: "author", name: "Made by", type: "text" },
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};

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
