import { PALETTE } from "../palette.ts";
import type { CollectionData } from "../schema.ts";

export const FLOWS = "flows";

/**
 * Automations. The Flows page (`/flows`) is how they are seen and edited, so the collection
 * stays out of the sidebar's collection list. `definition` is one value, so it merges as a
 * whole and two devices never mix halves of two flows.
 */
export const FLOWS_COLLECTION: CollectionData = {
  name: "Flows",
  icon: "workflow",
  color: PALETTE.vio,
  order: 9,
  hidden: true,
  fields: [
    {
      id: "status",
      name: "Status",
      type: "select",
      options: [
        { value: "draft", icon: "pencil", color: PALETTE.grey },
        { value: "on", icon: "circle-play", color: PALETTE.ok },
        { value: "off", icon: "circle-pause", color: PALETTE.grey },
        { value: "pending-approval", icon: "hourglass", color: PALETTE.warn },
      ],
    },
    { id: "definition", name: "Definition", type: "json", config: { schema: "flow" } },
    { id: "author", name: "Made by", type: "text" },
  ],
  views: [{ id: "table", name: "Table", type: "table", config: {} }],
};
