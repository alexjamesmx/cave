# M13: each section its own world, simple forms

The owner's ask (2026-10-25): notes fresh and only notes; tasks focused on the work in flight; any calendar day editable; a reminders table as complete as Transactions; an agenda built from the owner's own routine; no "chat with an agent" anywhere in the UI; no text shortcuts where a short form does better; income and expense categories apart; fewer fields everywhere; visual and simple.

Ships as parts, each committed on `main` once `check`, `test` and its e2e pass.

## Part 1: New, not Ask

- The Ask sheet becomes **New**: the quick forms only (Expense, Income, Task, Reminder, Payment, Note). The box that opens Claude, `AskBox`, `web/src/logic/ask-claude.ts`, a project's Ask box and an idea's "Start with Claude" go.
- The rail's button and the dock's centre button are **New** (a plus), ⌘K opens it, N still opens a note.
- The owner's two example draft flows ("Rent reminder", "Salary → save") are proposed for deletion through MCP. The seed keeps them as fixtures for the fake database.
- Check: the sheet has no box and no Claude link; e2e `ask` becomes `new`.

## Part 2: one reminder form

- One `ReminderForm` modal for new and existing reminders: Title, Date, Time (optional), Repeat. Editing adds Done and Delete (soft).
- The New sheet, every calendar view and the reminders table use it. The text "When" field (`tomorrow 9am`) goes from the UI; agents keep `when` over MCP.
- Calendar → Month: a click on a day's number adds one on that day; a click on a reminder edits it. Tasks and payments keep their own drawers.
- Check: e2e adds, edits, completes and deletes a reminder from Month.

## Part 3: Reminders table

- Calendar → Reminders is a page like Transactions: chips Upcoming (default), Overdue, Done, All; Repeat filter; search; grouped by day with counts; each row's Done, Snooze and Edit; New reminder.
- Check: unit tests for the filters; e2e for chips, search and a row's actions.

## Part 4: Agenda and Week from the owner's routine

- Week drops "free 16h"; each day lists its blocks and that day's reminders in time order; a click on a day header adds a reminder on it.
- Agenda's Today merges the routine blocks with the day's reminders, tasks and payments in one timeline; later days as now. A New reminder button. The routine is edited only in Week.
- Check: unit test for the merged timeline; e2e for a reminder showing in Week and Agenda.

## Part 5: Tasks for the work in flight

- Board shows To do, Doing and Waiting; Done and Dropped hide behind **Show done** (remembered per device), with their counts.
- List is a table like Transactions: chips Open (default), Done, Dropped, All; search; sort by due.
- Check: e2e for the toggle and the chips.

## Part 6: Money categories by direction

- Category options already carry a `kind` (expense, income, transfer) since M7b, and the New form already asks Expense or Income first. The leak is the item drawer: editing a transaction offered every category. It now offers the item's direction's categories, plus the one it already has.
- No migration, no PR. No text quick-add for money remains.
- Check: unit test for the choices; e2e for the drawer.

## Part 7: Notes fresh, and a pass for less

- The six imported notes are proposed for deletion (done 2026-10-25, waiting for approval).
- A pass over every form for the fewest fields and over every page for clutter: hints that restate the obvious, duplicate buttons, empty panels.
- Docs: guide, architecture, agents, decisions.

## Not in M13

Chat inside the app; a new dependency; changes to sync or auth.
