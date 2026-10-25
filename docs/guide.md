# Using the Cave

What each part of the app does. How it is built and run: `docs/system.md`.

## The shape

- **Unlock once per device** with the server token; without it the app shows only a lock screen. Settings → Devices & server → Lock this device, or Forget this device to also delete its copy.
- **Six sections** on the rail at the left (icons; the name shows on hover): Money, Calendar, Flows, Projects, Diary, Tasks, and Settings at the bottom. On a phone the rail is a dock at the bottom: four sections you choose (More → Edit dock, or Settings → General), Ask in the middle, More for the rest.
- **Ask from anywhere:** the rail's Ask (⌘K or Ctrl+K) opens one sheet with an Ask box that opens Claude with your question (Claude reads and writes the Cave through its connector) and five quick forms: Expense, Task, Reminder, Payment, Note. **N** opens the sheet on a note. A save closes the sheet and shows what was saved for a moment.
- **The app opens on the Scene** (Projects → Scene): you in the middle, every active project an orb around you. Size is activity this week, colour is status, a dashed ring means an agent is on it; paused projects sit on the outer ring, dim. Hover shows the agent's latest report; click enters the project. The same orbs are a list for the keyboard and screen readers. Above it, **Needs you**: questions agents asked, blocked parts and flows waiting for approval, each with its actions; it hides when there is nothing. What is due is Calendar's.

## Projects

- **Scene**, **All** (cards: a status dot, "72% · on track · agent working", the next due part; Needs you on top), **Ideas**, **Activity** (agents' runs, filtered by status; flows' and jobs' runs are under Flows → Runs, a source filter away here), and a tab per pinned project.
- **A project's status** is computed, never typed: done, dropped or paused from its own status; **blocked** when a part is blocked; **waiting on you** when an agent asked a question; **slipping** when its review date passed, a part is overdue, or progress is more than 15 % behind the schedule between its creation and its latest part due date; else **on track**. Progress is the template's rule (LeetCode: problems solved), else parts done, else tasks done.
- **Every project has the same page:** a status ring, the goal and a meta line (where it lives, agents in the last 30 days, parts done, the last report, the next review), then
  - **Overview:** the Plan (parts as a checklist in order, the current one marked, a blocked one with its reason), the latest from the agent (its last step, and its open question with Answer), Connected (where it lives, notes, flows, and every collection with items of the project), open tasks, Add task, Ask about this project.
  - **Board:** the project's tasks as a kanban.
  - **Diagram:** Mermaid text (flowcharts, sequence, class, state, ER) rendered beside the editor; saved when you leave the box; a mistake shows under the editor and the last good drawing stays. Agents edit it as the `diagram` field.
  - **Canvas:** a whiteboard with the parts, tasks and items as cards; drag to arrange, add sticky notes, frames and shapes (box, rounded box, diamond) with text, connect parts and shapes for "depends on"; view-only on a phone. Active runs glow beside their part.
  - **Activity:** the project's runs, filtered by agent.
- **Ideas:** yours, newest first: capture one, promote it to a project with a template, or start one with Claude. Agents' finds left this page in M12; the `radar` collection stays under Settings → Data.
- **Notes** have no view of their own since M12: they are pages inside a project (M12 part 6), and until then every note is listed at the bottom of All, newest first, opening in the drawer. Agents add notes with `add_note`.
- **Agents ask you** through tasks: a question from `log_step` becomes "Answer: …" in the project, listed under Needs you and on the project's Overview; write the answer in the task's body and mark it done, and the agent reads it back with `get_project`.

## Money

- **Add** an expense or income from Transactions (New entry: the form stays open for the next receipt) or the Ask sheet, for any day and time (Today, Yesterday). The category is a searchable select that offers the direction's categories; transfers (investments) count as neither spending nor income. With one account in the list it is taken without asking; add another under Categories & accounts and the account picker returns.
- **Transactions:** one month at a time (arrows, or All time) with its in, out and net on top; chips All, Expenses, Income, Transfers and Uncategorized (no category, or one that is no longer in the list); search; Group by day, category or account, each group with its subtotal, collapsible. Undated entries are listed and counted apart, never filled in.
- **Overview:** month or year. Spent, Income, Saved and Invested (transfers into Investment) with their change against the previous period and a 12-month line; the month day by day; where it went against last period, each row opening the ledger on that category; the last 12 months stacked by category; top titles and the largest entries. Filters are kept in the URL.
- **Budget:** two amounts you type (Overview → Budget → Edit, or Settings → General): a monthly limit and a saving target. The Budget tile shows what is left (or how far over) and where the month ends at the current pace; the year uses twelve times the limit. Crossing 80 % and 100 % of the limit notifies you once each a month, on every channel that is ready. Claude reads the same numbers through `money_month`.
- **Payments** (cards, subscriptions, bills, anything paid on a date): you are notified before it is due (Notify days before); Paid logs the expense and moves the same payment to its next date; Undo reverses both. Grouped as Overdue, This week, Later, Needs date and Inactive.
- **Net worth:** what you own minus what you owe.
- **Categories & accounts:** the two lists every expense, income and payment picks from (name, emoji, colour, kind, order, archive). Other lists (task statuses, idea stages) are edited in the field editor under Settings → Data.

## Calendar and reminders

- **Reminder** (Ask sheet): a title and a "When" in plain English or Spanish: `tomorrow 9am`, `vie 18:00`, `in 2h`, `every month 22 9:00`, `cada mes 22 9:00`. The form shows what it will save, and won't save without a date.
- **Done and Snooze** on every reminder (the drawer, the table, the agenda, Needs you). A repeating reminder moves to its next occurrence and stays open; the 31st becomes the 30th in shorter months and returns to the 31st. Undo puts the previous values back.
- **Month** (or `C`): a grid with repeats shown ahead; **Agenda**: 14 days with anything overdue on top; **Reminders**: the table. Click a day to add a reminder. Scheduled flows show their next run.
- A reminder with a date and no time is due at the reminder time in Settings → General (09:00 by default).

## Flows

- **Canvas:** one flow as a graph: the trigger on the left, its steps to the right, "else stop" under an if. Click a node to edit it in the inspector; the forms come from the same registry that validates flows and gives agents their schema. Text can use `{{item.amount|pct:20}}`, `{{today}}` and the like from a picker. Pick a flow at the top, or New flow; Duplicate copies one as a draft. The same picker lists what the Cave runs on its own under **Built in** (reminders, payments, the budget, the digest, scheduled flows, Telegram, backups, the off-box copy): each opens as a card with what it does, its schedule and its last and next run; nothing there is editable.
- A trigger is a schedule, an item added, or a field changed; steps are if, create an item, change the trigger item, and notify. **Test run** shows what each step would do and writes and sends nothing. Turn on when it is right.
- **Runs:** everything the Cave ran on its own, newest first: each flow run with its steps' outcomes (anything it wrote links to the item and has Undo) and each built-in job's run with its result; filter to flows or built in. A flow's own page keeps its run history too. Flows waiting for approval show in the picker, under Needs you and in Settings → Agents. Agents' runs are under Projects → Activity.
- **Two drafts to start from:** "Rent reminder" and "Salary → save". **Agents build flows** through `save_flow`; one that changes existing items waits for your Approve (Flows, Settings → Agents, Needs you, or Telegram if you allow it); see `docs/agents.md`.

## Diary

- **Write:** one entry per day with the habits as toggles; text saved on blur; arrows move between days, and the day follows today until you pick one. **Habits:** a month heat map and 30-day streaks. **Months:** a grid where a written day has a dot and the habits logged a strip of pips; click a day to open it in Write.

## Tasks

- **Board**, **List** and **Calendar** of every task; one New task button; drag between columns (press and hold on a phone), arrow keys move a focused card. A task with a project carries a bar in the Projects colour. A repeating task's Done brings the same task back on its next date. Questions from agents are tasks too, until answered.

## Settings

- **General:** your name and goal (the Scene's centre), time zone, reminder time, theme, what the app opens on, motion (on, or follow the system's reduced-motion setting), the phone dock.
- **Devices & server:** this device (lock, forget), the devices that synced in the last 30 days, the server (version, last deploy, backups, off-box copy), integrations; sub-sections for Schedules (the next 7 days: reminders, flow slots, jobs, the deploy check), Jobs (and their runs) and Notifications (the log by channel and key, titles never stored; the Dev outbox outside production).
- **Notifications:** Web Push on this device (on iPhone, from the Home Screen app), and the channels: Telegram once linked, Discord with a webhook, Email through Resend (`docs/hosting.md` step 12). Web Push is private and the default; Telegram and Discord get titles only unless you choose full detail; email goes to your own inbox, so it gets full detail. The **daily digest** is one email at the time you set here: questions and blocked parts, what is due, payments due today and the budget line.
- **Agents:** flows waiting for approval, delete proposals, and each agent token with its permissions and use. Agents' runs are under Projects → Activity.
- **Data:** Download export (every record as JSON; `bun run export` does the same on the server), Import (an export file back in: compared with this device first, then only what differs is written, as edits from here, so it syncs and can be undone; nothing is removed), every collection raw with its views and the field editor, and the undo history of agents' writes.

## Notifications

- **Reminders and payments reach you when they're due**, within a minute, on every channel that is ready; the budget tells you at 80 % and 100 % of the limit. **Act from the notification:** Done and Snooze 1h open the Cave and apply there (in an email they are links); in Telegram the buttons work in the chat, and `/remind`, `/due` and `/help` work too.
- Setup: `docs/hosting.md` step 12.

## Backups

- **Automatic.** The server takes a backup when it starts, if the newest is more than a day old, and checks again every hour.
  - Each backup is a full SQLite copy, checked with `integrity_check` before it counts. A copy that fails is renamed `*.failed` and kept.
  - It keeps the newest 14, plus the newest of each of the last 12 months, and deletes only older backup files.
- **Where.** `data/backups/`, or the folder in `BACKUP_DIR`. On the VPS: `/var/lib/cave/backups`, copied off-box to R2 (`docs/system.md` section 4).
  - File names are UTC times: `cave-2026-10-13T1405.db`.
  - **Backups hold everything, every amount and note, unencrypted. Keep them in a private place.**
- **By hand.** `bun run backup` takes one now, even while the server runs.
- **Restore.** Stop the server, then `bun run restore <backup file>`.
  - Restore is for a lost or broken server. It does not roll data back: devices push everything newer than the backup straight back. To reverse a change, use Undo under Settings → Data (agents' writes) or set the value back from the item's history in its drawer.
  - The current database is renamed `cave.db.before-restore-<time>`, never deleted.
  - The restored database gets a new id. On their next sync, devices push back anything newer than the backup.
