import type { CollectionData } from "../schema.ts";

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
