# Using the Cave

What each part of the app does. How it is built and run: `docs/system.md`.

## The shape

- **Unlock once per device** with the server token; without it the app shows only a lock screen. Settings → Devices & server has Lock this device, and Forget this device, which also deletes its copy.
- **Five sections and Settings.** The sidebar on the left has an emoji tile per section: 💸 Money, ✅ Tasks, 📅 Calendar, 📝 Notes and ⚡ Flows, with ⚙️ Settings at the bottom.
  - **Hide names** collapses it to the tiles, remembered on this device.
  - On a phone, a dock at the bottom shows Money, Tasks, a raised +, Calendar and Notes. ⚙️ in each page's header opens every section, Flows and Settings included.
- **New from anywhere.** + New on the sidebar (⌘K or Ctrl+K; the dock's + on a phone) opens one sheet with five choices: 💸 Money, ✅ Task, 🔔 Reminder, 🔁 Subscription and 📝 Note.
  - **N** opens it on a note.
  - A save closes the sheet and shows what was saved for a moment.
  - There is no chat in the app: agents read and write the Cave through the connector.
- **The app opens on Money's overview.** What is due is in Calendar → Agenda. Flows waiting for your approval are in Settings → Agents and on the Flows canvas.

## Money

- **Add an entry** (New → Money, or + New entry in Transactions).
  - The amount comes first, then Expense or Income. Tap a category from the emoji grid; More shows them all.
  - Pick the account. The one you used last is already picked, and every entry has an account; with none in the list, the form asks you to add one first.
  - Set when (Today, Yesterday or Other). The title is optional.
  - Save says what it will save ("Save −$245 · Food").
  - From Transactions the form stays open for the next receipt.
  - Transfers (investments) count as neither spending nor income.
- **Transactions.**
  - **Scope:** one month or one year at a time; a year runs from 1 January to today. On top: what came in, what went out and what's left.
  - **Search:** finds anything, whether title, note, category, account or amount (`245`, `$1,225`).
  - **Chips:** All, Expenses, Income and **To review**. To review holds entries with no category or no account; pick the category right on the row.
  - **Layout:** days group the entries, each day with its total. On a phone each entry is a card.
  - **Editing:** tap an entry to edit it.
- **Overview.**
  - Month or year.
  - Spent, Came in, Saved and Budget left on top.
  - "Where it went" by category, beside the month day by day; a category opens Transactions on that category for the same month or year.
  - The last 12 months stacked by category.
- **Budget.**
  - **Two amounts you type** (Overview, or Settings → General): a monthly limit and a saving target.
  - **Budget left:** shows what's left, or how far over, and where the month ends at the current pace. The year uses twelve times the limit.
  - **Alerts:** crossing 80 % and 100 % of the limit notifies you once each a month. Claude reads the same numbers through `money_month`.
- **Subscriptions.**
  - **What you see:** what you pay for every month or year: the cost a month and a year, the next charge (it moves on by itself), since when, and how much you've spent.
  - **Paid:** logs this charge as an expense, linked to the subscription, with its amount, category and account.
  - **Spent and Since:** they come from your real expenses, so a paused month counts nothing.
  - **Changing one:** open it to edit, Pause, Resume or Delete.
  - **Reminders:** it never reminds on its own. For a reminder, make a flow that starts **When a date arrives**.
- **Net worth:** what you own minus what you owe.
- **Categories:**
  - **Lists:** Expenses, Income, Transfers and Accounts, the lists every entry picks from. Each row shows its emoji, name, colour (16 to choose from) and how many entries use it. Drag to reorder.
  - **Deleting a category or account:** asks where its entries go, whether another one or To review, then removes it. Undo puts it all back.

## Calendar

- **Month** (or `C`): the month with every dated thing on its day, marked 🔔 reminder, ✅ task or 💳 payment.
  - Click a day to add a reminder on it, or an item to open it.
  - Beside it, **Upcoming**: "Remind me to…" with Today, Tomorrow, a date and a time, then Overdue, Today, Tomorrow, This week and Later.
- **Agenda:** the same list on its own page, with everything that has a date: reminders, tasks with a due date and payments.
  - ✓ marks a reminder or a task done, or logs a payment as paid. A repeating one moves to its next date.
  - Undo puts the previous values back.
- **Reminders:** one form everywhere, with Title, Date, Time (empty for the whole day) and Repeat. Open one to change it, mark it Done, Snooze it or Delete it.
  - A reminder with a date and no time is due at the reminder time in Settings → General (09:00 by default).
- **Routine:** the week you aim for, as a guide and nothing more.
  - **Layout:** one column per weekday, plus the "some times a week" blocks under Any day. On top are each area's hours a week.
  - **Blocks:** coloured by their area (Body, Learn, Rest, Fun, Other). A day's + adds one; a click edits it.
  - **No effects:** it has no dates, never notifies and counts nothing.

## Flows

- **Flows:** one canvas with every flow, grouped by what starts it (On a schedule, each collection it watches, Needs fixing), and the **System** jobs that keep the Cave running (scheduled flows, Telegram, backups, the off-box copy, the runs trim) as a read-only group of their own. Everything the Cave tells you runs through flows, and five come installed: **Reminder notifications** (a reminder when it is due, with Done and Snooze), **Bill notifications** (a payment that isn't a subscription, the day before), **Budget at 80%** and **Budget at 100%** (once a month), and the **Daily digest** (one email a day, off until you turn it on; its time is its schedule). Edit, turn off or delete them like any flow. Each flow is a lane: its card (name, On, Off, Draft or Needs approval, its last run) then its trigger and steps, "else stop" under an if; a flow that is on glows and its edges move. Click a card or a node to open it in the inspector beside the canvas (`/flows/<id>`), where the forms edit it; they come from the same registry that validates flows and gives agents their schema, and edits show on the canvas until you Save. Text can use `{{item.amount|pct:20}}`, `{{today}}` and the like from a picker. **New flow** sits on the canvas; Duplicate copies one as a draft; Delete removes one (it stops running and stays in the history). A built-in job opens read-only with what it does, its schedule and its last and next run.
- A trigger is a schedule, an item added, a field changed, **a date arriving** (any date field of a collection, optionally some days before; a repeating date arrives on each date of its series, a paused or done item is skipped, and one seen more than 6 hours late is let go), or **spending reaching** a share of the monthly limit; steps are if, create an item, change the trigger item, notify (opening the trigger item, it carries what that item needs: Done and Snooze on a reminder), send an email (to you, or to up to 5 addresses, with its own subject, message and sender name), and send the daily digest. **Test run** shows what each step would do and writes and sends nothing. Turn on when it is right.
- **Runs:** everything the Cave ran on its own, newest first: each flow run with its steps' outcomes (anything it wrote links to the item and has Undo) and each System job's run with its result; filter to flows or System. A flow's own page keeps its run history too. Flows waiting for approval show on the canvas and in Settings → Agents.
- **Two drafts to start from:** "Rent reminder" and "Salary → save". **Agents build flows** through `save_flow`; one that changes existing items waits for your Approve (Flows, Settings → Agents, Needs you, or Telegram if you allow it); see `docs/agents.md`.

## Notes

- **Notes** (`/notes/all`): everything you write, ideas included.
  - **Topics:** listed on the left (on a phone, a row of pills): All, 📥 Inbox (no topic), 💡 Ideas, then yours. A topic is a `/`-separated path such as `School/Calculus`.
  - **Capture:** type in the capture bar and press Enter to save a note in the open topic. The first line becomes the title.
  - **Search:** `/` searches the title, topic and text.
  - **Cards:** each note is a card tinted by its topic.
  - **Editor:** + New note, or a card, opens the editor: a title, a topic, a colour, and Markdown. A ```` ```mermaid ```` block draws a diagram, and `[[Title]]` links another note.
  - **Deleting:** Delete keeps the note in the history.
  - **Agents:** `add_note` lands notes under the topic Inbox.
- **Today** (`/notes/write`): one day full width.
  - **The day:** the entry in the Markdown editor, the habits as toggles, a colour, and Delete entry (kept in the history).
  - **Moving between days:** the arrows. The day follows today until you pick one.
- **Days:** the month as a grid.
  - **Each day:** a dot for a written day, a strip of the habits logged, and the day's colour as its tint.
  - **Beside it:** the habits' last 30 days and streaks. **Add habit** adds one.
  - **Reading:** click a day to read it. Edit opens it in Today's editor.
- **LeetCode:** the problems you track, with their progress.
- **Ideas** are notes in the topic Ideas since M14, and the old Ideas links open that topic.

## Tasks

- **Board**, for the work in flight.
  - **Columns:** To do, Doing and Waiting. Each fills the screen.
  - **Moving cards:** drag a card anywhere in a column to drop it there (press and hold on a phone). Arrow keys move a focused card.
  - **Adding:** + in a column's header, or + Add a task at its bottom, adds a task to that column.
  - **Cards:** say when they're due ("Overdue · 1 day", "Today · 17:00"); 🔥 marks high priority.
  - **Show done:** adds Done and Dropped.
  - **Repeating tasks:** Done brings the task back on its next date.
- **List:** a table with Open, Done, Dropped and All, plus search, with open tasks sorted by due date.

## Settings

- **General:** the budget, time zone, reminder time, and what the app opens on. Motion follows the system's reduced-motion setting.
- **Devices & server:** this device (lock, forget), the devices that synced in the last 30 days, the server (version, last deploy, backups, off-box copy), integrations; sub-sections for Schedules (the next 7 days: reminders, flow slots, jobs, the deploy check), Jobs (and their runs) and Notifications (the log by channel and key, titles never stored; the Dev outbox outside production).
- **Email:** Settings → Notifications → Email sets who every email goes to and the name it comes from (the address stays the server's verified one); a flow's Send an email step can name its own.
- **Notifications:** Web Push on this device (on iPhone, from the Home Screen app), and the channels: Telegram once linked, Discord with a webhook, Email through Resend (`docs/hosting.md` step 12). Web Push is private and the default; Telegram and Discord get titles only unless you choose full detail; email goes to your own inbox, so it gets full detail. What notifies is a flow (see Flows): this page only says where notifications go and how much each channel is told.
- **Agents:** flows waiting for approval, delete proposals, and each agent token with its permissions and use.
- **Data:** Download export (every record as JSON; `bun run export` does the same on the server), Import (an export file back in: compared with this device first, then only what differs is written, as edits from here, so it syncs and can be undone; nothing is removed), every collection raw with its views and the field editor, and the undo history of agents' writes.

## Notifications

- **Reminders and bills reach you when they're due**, within a minute, on every channel that is ready, through their flows; the budget flows tell you at 80 % and 100 % of the limit. **Act from the notification:** Done and Snooze 1h open the Cave and apply there (in an email they are links); in Telegram the buttons work in the chat, and `/remind`, `/due` and `/help` work too.
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
