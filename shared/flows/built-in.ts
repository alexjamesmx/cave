import type { Doc } from "../types.ts";
import type { FlowDefinition } from "./registry.ts";
import { FLOWS } from "./seed.ts";

/**
 * What the Cave did on its own until it all ran through flows: reminders, payments, the
 * budget and the daily digest, now ordinary flows the owner sees, edits, turns off or
 * deletes. Seeded on, with the digest on only when a digest time was set.
 */

const reminders: FlowDefinition = {
  version: 1,
  trigger: { type: "date-arrives", collection: "reminders", field: "due" },
  steps: [{ type: "notify", title: "{{item.title}}", open: "trigger-item" }],
};

const payments: FlowDefinition = {
  version: 1,
  trigger: {
    type: "date-arrives",
    collection: "payments",
    field: "due",
    before: 1,
    where: [{ field: "kind", op: "!=", value: "subscription" }],
  },
  steps: [{ type: "notify", title: "{{item.title}} · due tomorrow", open: "trigger-item" }],
};

const budget = (percent: number): FlowDefinition => ({
  version: 1,
  trigger: { type: "budget-reached", percent },
  steps: [
    {
      type: "notify",
      title:
        percent >= 100
          ? "Budget · over this month's limit"
          : `Budget · ${percent}% spent this month`,
      open: "trigger-item",
    },
  ],
});

const digest = (at: string): FlowDefinition => ({
  version: 1,
  trigger: { type: "schedule", every: "day", at },
  steps: [{ type: "digest" }],
});

const flow = (
  id: string,
  title: string,
  about: string,
  status: string,
  definition: FlowDefinition,
) => ({
  id,
  kind: "item" as const,
  collection: FLOWS,
  data: { _title: title, _body: about, status, definition, author: "cave" },
});

const DIGEST_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The four, the digest at the owner's old digest time if one was set. */
export function builtInFlows(digestAt?: unknown) {
  const at = typeof digestAt === "string" && DIGEST_RE.test(digestAt) ? digestAt : undefined;
  return [
    flow(
      "flow-reminders",
      "Reminder notifications",
      "Tells you when a reminder is due, with Done and Snooze.",
      "on",
      reminders,
    ),
    flow(
      "flow-payments",
      "Bill notifications",
      "Tells you the day before a bill is due. Subscriptions don't remind unless you add a flow.",
      "on",
      payments,
    ),
    flow(
      "flow-budget-80",
      "Budget at 80%",
      "Tells you once a month when spending reaches 80% of the limit.",
      "on",
      budget(80),
    ),
    flow(
      "flow-budget-100",
      "Budget at 100%",
      "Tells you once a month when spending reaches the limit.",
      "on",
      budget(100),
    ),
    flow(
      "flow-digest",
      "Daily digest",
      "One email a day: what needs you, what is due, payments, the budget.",
      at ? "on" : "off",
      digest(at ?? "08:00"),
    ),
  ];
}

/** Seed migration 23: the built-in flows, unless the database has them already. */
export function builtInFlowsMigration(get: (id: string) => Doc | undefined) {
  const notifications = get("settings")?.data.notifications as { digest?: unknown } | undefined;
  return builtInFlows(notifications?.digest).filter((f) => !get(f.id));
}
