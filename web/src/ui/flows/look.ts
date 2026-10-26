/** Each trigger and step type's icon and colour, on the canvas and the overview cards alike. */
export const LOOK: Record<string, { icon: string; color: string }> = {
  schedule: { icon: "clock", color: "var(--ok)" },
  "item-added": { icon: "circle-plus", color: "var(--ok)" },
  "item-changed": { icon: "pencil", color: "var(--teal)" },
  if: { icon: "split", color: "var(--warn)" },
  create: { icon: "square-plus", color: "var(--teal)" },
  "update-trigger-item": { icon: "pen-line", color: "var(--orange)" },
  notify: { icon: "bell", color: "var(--bad)" },
  email: { icon: "mail", color: "var(--wait)" },
};

export const lookOf = (type: string) => LOOK[type] ?? { icon: "circle", color: "var(--muted)" };

/** The path of a built-in job's card. */
export const jobPath = (id: string) => `/flows/jobs/${encodeURIComponent(id)}`;

/** One line on what each built-in job does; the schedule comes from the server. */
export const JOB_ABOUT: Record<string, string> = {
  reminders: "Sends each reminder's notification when it is due, once per due date.",
  payments: "Tells you before a payment is due and on the day, once per due date.",
  budget: "Checks the month's spending against your limit and tells you at 80 % and 100 %.",
  digest: "One email a day with what needs you, what is due, payments and the budget.",
  flows: "Runs every flow that is on when its schedule or its trigger says so.",
  telegram: "Listens for your messages and button taps in the Telegram chat.",
  backups:
    "Takes a full copy of the database when the newest is more than a day old, checked hourly.",
  offsite: "Checks the off-box copy and reports its last result.",
  "runs-trim":
    "Keeps the newest 500 runs in Activity and the newest 500 flow and job runs; older ones go.",
};
