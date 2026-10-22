# Using the Cave

What each part of the app does. How it is built and run: `docs/system.md`.

## Everyday use

- **Unlock once per device** with the server token; without it the app shows only a lock screen. Settings → Lock this device, or Forget this device to also delete its copy.
- **Home** is a live glance (due today and tomorrow, this month's spending and daily rate, payments in the next 7 days, habits this week, flows, sync and deploy) and an **Ask** box that opens Claude with your question; Claude reads and writes the Cave through its connector. Quick forms: Expense, Task, Reminder, Payment.
- **Projects** hold a goal, parts (milestones, components or phases, nested), tasks and anything else linked to them. Each has an Overview built from its template, a **Map** (drag parts and tasks, add sticky notes and frames, connect parts for "depends on"; view-only on the phone), a Board of its tasks, its **Activity** (what agents did on it, step by step, live) and its Items. An idea can be promoted to a project, and agents read one whole with `get_project`.
- **Notes** (Projects → Notes, and each project's Notes tab): folders, offline search that ignores accents, Markdown with `[[wikilinks]]`, Links and Linked from. **N** on Home writes a quick note into the Inbox; Home lists the five latest. Agents add notes with `add_note`.
- **Radar** (Projects → Radar): what agents find for you, ranked by your interests (Settings → General). For you, All and Saved; Save makes one Inbox note per finding, optionally on a project; Dismiss hides it. Home shows the three newest For you. Ask Claude: "find this week's AI news for my radar".
- **On the phone**, a dock at the bottom: four sections you choose (More → Edit dock), a raised Ask, and More for everything else.
- **Money:** add an expense or income for any day and time (Today, Yesterday); categories carry emoji and fit the direction; transfers (investments) count as neither spending nor income. Month or year, Compare to previous, filters kept in the URL, 12-month trends, top titles, fixed versus variable. **Review categories** applies `bun run money-review`'s proposals only after you approve them, with one Undo.
- **Payments** (cards, subscriptions, bills): Paid logs the expense and moves the same payment to its next date; Undo reverses both. Grouped as Overdue, This week, Later, Needs date and Inactive. Money → Review proposes subscriptions from your history; approving one creates the payment and links its past charges, and nothing changes until you approve.
- **Tasks:** one New task button, drag between columns (press and hold on the phone). A repeating task's Done brings the same task back on its next date.
- **AI → Overview** maps the whole AI setup (where AI is used, what connects it, the Cave's tools, flows and jobs) with counts; **AI → Activity** lists every run (agents', flows' and jobs'). **Settings → Lists** edits every choice the Cave offers (name, emoji, colour, order, archive).
- **AI:** every rule, skill, MCP server, plugin and memory from `bun run ai-sync`, with secrets removed; edit one and `bun run ai-sync --apply` writes it back after you confirm. **Update with Claude** opens Claude to add what is missing and improve what is there (through the cave connector, never deleting or writing a secret); **Improve with Claude** does it for the items you tick. Search, filter (kind, surface, scope, status), sort (kind, title, last changed, source) and reverse; the view is kept in the link. Copy for another AI makes one Markdown document.

## Reminders and the calendar

- **Home → Reminder:** a title and a "When" in plain English or Spanish: `tomorrow 9am`, `vie 18:00`, `in 2h`, `every month 22 9:00`, `cada mes 22 9:00`. The form shows what it will save, and won't save without a date.
- **Done and Snooze** on every reminder (the drawer, the table, the agenda, the Due card). A repeating reminder moves to its next occurrence and stays open; the 31st becomes the 30th in shorter months and returns to the 31st. Undo puts the previous values back.
- **`/calendar`** (or `C`): a month grid with repeats shown ahead, and a 14-day agenda with anything overdue on top. Click a day to add a reminder.
- **The Due card** on Home: overdue, today and tomorrow.
- A reminder with a date and no time is due at the reminder time in Settings (09:00 by default).

## Notifications

- **Reminders reach you when they're due**, within a minute: by Web Push on each device that enabled it (Settings → Notifications on this device; on iPhone, from the Home Screen app), by Telegram once linked, and by Discord if a webhook is set.
- **Web Push is private and the default.** Telegram and Discord can read what they carry, so they get titles only unless you choose full detail in Settings.
- **Act from the notification:** Done and Snooze 1h open the Cave and apply there; in Telegram the buttons work in the chat, and `/remind`, `/due` and `/help` work too.
- Setup: `docs/hosting.md` step 12.

## Flows

- **`/flows`** (Flows in the sidebar): automations as a trigger and steps, drawn top to bottom. A trigger is a schedule, an item added, or a field changed; steps are `if`, create an item, change the trigger item, and notify.
- **Edit with forms** built from the same registry that validates flows and gives agents their schema. Text can use `{{item.amount|pct:20}}`, `{{today}}` and the like from a picker.
- **Test run** shows what each step would do against now or the newest matching item, and writes and sends nothing. **Run history** keeps the last 20 runs; anything a run wrote links to the item and has Undo.
- **Two drafts to start from:** "Rent reminder" and "Salary → save". Set the real day and amounts, then Turn on.
- **Agents build flows** through `save_flow`. One that changes existing items waits for your Approve (Flows page, Agents page, or Telegram if you allow it); see `docs/agents.md`.
- The calendar shows each scheduled flow's next run.

## The system view

- **`/system`** (System in the sidebar): everything the Cave has and runs, on one page with tabs.
  - **Overview:** items per collection and when each last changed, devices that synced in the last 30 days, the running commit and last deploy, the last backup, and each integration's status.
  - **Schedules:** what runs in the next 7 days: reminder notifications, flow slots, server jobs, and the deploy timer's next check (approximate).
  - **Jobs**, **Flows** (with Approve/Reject for waiting ones), **Agents**, and **Notifications** (the last 100 sends by channel and key; titles are never stored).
- Counts, schedules and flows come from this device's copy and work offline; the server's parts say "offline" when it can't be reached. The page never shows a token, key, webhook, push endpoint or chat id.

## Backups

- **Automatic.** The server takes a backup when it starts, if the newest is more than a day old, and checks again every hour.
  - Each backup is a full SQLite copy, checked with `integrity_check` before it counts. A copy that fails is renamed `*.failed` and kept.
  - It keeps the newest 14, plus the newest of each of the last 12 months, and deletes only older backup files.
- **Where.** `data/backups/`, or the folder in `BACKUP_DIR`. On the VPS: `/var/lib/cave/backups`, copied off-box to R2 (`docs/system.md` section 4).
  - File names are UTC times: `cave-2026-10-13T1405.db`.
  - **Backups hold everything, every amount and note, unencrypted. Keep them in a private place.**
- **By hand.** `bun run backup` takes one now, even while the server runs.
- **Restore.** Stop the server, then `bun run restore <backup file>`.
  - Restore is for a lost or broken server. It does not roll data back: devices push everything newer than the backup straight back. To reverse a change, use Undo on the Agents page (agent writes) or set the value back from the item's history in its drawer.
  - The current database is renamed `cave.db.before-restore-<time>`, never deleted.
  - The restored database gets a new id. On their next sync, devices push back anything newer than the backup.
- **Export.** `bun run export` writes every record as JSON to `data/exports/`. Settings → "Download export" does the same from any device.
