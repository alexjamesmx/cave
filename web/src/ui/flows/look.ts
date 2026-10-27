/** Each trigger and step type's icon and colour, on the canvas and the overview cards alike. */
export const LOOK: Record<string, { icon: string; color: string }> = {
  schedule: { icon: "clock", color: "var(--ok)" },
  "item-added": { icon: "circle-plus", color: "var(--ok)" },
  "item-changed": { icon: "pencil", color: "var(--teal)" },
  "date-arrives": { icon: "calendar-clock", color: "var(--warn)" },
  "budget-reached": { icon: "gauge", color: "var(--bad)" },
  digest: { icon: "newspaper", color: "var(--wait)" },
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
  flows: "Runs every flow that is on when its schedule or its trigger says so.",
  telegram: "Listens for your messages and button taps in the Telegram chat.",
  backups:
    "Takes a full copy of the database when the newest is more than a day old, checked hourly.",
  offsite: "Checks the off-box copy and reports its last result.",
  "runs-trim":
    "Keeps the newest 500 runs in Activity and the newest 500 flow and job runs; older ones go.",
};
