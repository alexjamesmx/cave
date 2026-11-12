# Architecture

Visual tokens are listed at the end of this file; past milestones' approved mockups are in their `<m>-history` tags. How the pieces are hosted and how code and data move between them: `docs/system.md`.

## Shape

```
web (PWA, React) ──IndexedDB (Dexie, full copy)──┐
                                                 │ POST /api/sync (push outbox, pull since cursor)
server (Bun.serve) ── bun:sqlite data/cave.db ◄──┘
   ├── /api/*   owner API (status, export, history, activity, system, flows, notifications, push, money review, agents)
   ├── /mcp     MCP server for agents (per-agent tokens)
   └── jobs     30-second loop: flows (reminders, bills, the budget and the digest among them), Telegram polling, the backup check
```

Single owner, a few devices. No hosted sync engine.

## Data model

One table holds everything:

| column | type | notes |
|---|---|---|
| `id` | text pk | ULID; `imp-<sha1(vault path)>` for docs from the retired Obsidian import, which stay valid |
| `kind` | text | `collection`, `item`, `setting` |
| `collection` | text | for items: the collection id |
| `data` | text (JSON) | top-level keys are field ids plus `_title`, `_body`, `_created`, `_deleted` |
| `stamps` | text (JSON) | one hybrid logical clock stamp per top-level key in `data` |
| `seq` | integer | server-assigned, increases on every stored change; index it |
| `actor` | text | `user:<deviceId>`, `agent:<name>`, `flow:<id>`, `channel:telegram`, `seed` |

Activity log table `changes(seq, id, actor, at, keys, before)` feeds the Agents page and undo; `before` holds the previous value and stamp of each changed key. Schema changes go through migrations keyed on `PRAGMA user_version`.

Dates are ISO 8601 local strings: `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when the field config has `withTime: true`. The `settings` doc holds `timezone` (`America/Mexico_City`) and `reminderTime` (`09:00`: when a date-only reminder is due). `_created` is an ISO 8601 UTC string set on a doc's first write.

Stamp format: `<ms, 13 digits>:<counter, 4 digits>:<deviceId>`, so string comparison orders them. Merge is last-writer-wins per top-level key: for each key keep the value with the greater stamp. Deletion is `_deleted: true` with its own stamp; nothing is removed from the table.

A collection's `data`: `name`, `icon`, `color`, `order`, `hidden?`, `fields` (array of `{id, name, type, options?, config?, archived?}`; removing a field archives it, and ids are never reused), `views` (array of `{id, name, type, config}`). Field types: `text`, `number`, `money`, `date`, `select`, `checkbox`, `url`, `json` (one value checked by a named schema: `flow`, `map`, `steps`; it merges as a unit) and `ref` (an item id; `config.collection` names the target, checked on device, agent and flow writes, not on sync). Select options: `{value, icon, color, label?, emoji?, kind?, archived?}`. The `value` never changes; an archived option stays on old items but isn't offered. `config.optionsFrom` makes a select show another field's options (payments use money's categories and accounts). View types: `table`, `board`, `gallery`, `calendar`, `write`, and dashboards `money`, `wealth`, `habits`, `progress`.

## Sync protocol

`POST /api/sync` body `{deviceId, cursor, changes: Doc[]}`, response `{cursor, changes: Doc[], rejected: {id, error}[], serverTime, dbId}`.

- Server merges each incoming doc in one transaction, assigns `seq` only when the merge changed something, returns every doc with `seq > cursor`.
- Field values are checked only for the keys a doc changes. A doc with an invalid value is listed in `rejected` and the rest are applied; the client keeps its outbox row and shows the error. Select membership and ref targets are checked on device, agent and flow writes, not on sync. The client pushes settings, then collections, then items.
- Client keeps an `outbox` table `{id, rev}`. A write updates the local doc and bumps `rev`. After a successful sync it removes outbox rows whose `rev` is unchanged, and merges pulled docs with the same function the server uses.
- Triggers: app start, 1 s after a local write, `online` event, tab becoming visible, every 60 s.
- Idempotent: re-sending the same changes is harmless.
- Pull pages of 1000 docs (the client loops until a short page); a push is at most 1000 docs and 8 MiB, sent in batches of 200.
- `dbId` names the server database; a restore writes a new one, and a client that sees a different id puts every doc in its outbox and starts over from cursor 0.
- The server listens on `127.0.0.1` unless `CAVE_HOST` says otherwise, and refuses to start on a non-loopback host without `CAVE_TOKEN`. When `CAVE_TOKEN` is set, every `/api` call needs `Authorization: Bearer <token>`; `/mcp` takes agent tokens only.
- Stamps more than 10 minutes ahead of server time are rejected (400 `clock ahead`).

## Seed collections

Seeded once with stamp time 0, so any user edit wins. Changes to seeded collections after real databases exist ship as seed migrations (`shared/seed.ts`), run once per `settings.seedVersion`, merged with what the database holds.

| id | fields | views |
|---|---|---|
| `money` | date, amount (money), direction (income/expense), category (select; options carry `label`, `emoji` and `kind`: expense, income or transfer), detail, account (select, options archived never deleted), payment (ref) | money dashboard, table, untagged (category empty) |
| `tasks` | status (todo/doing/waiting/done/dropped), priority (high/normal/low), due (with time), repeat, notify, area, completed, cancelled | board by status, table (the calendar view retired by migration 21; Calendar → Month shows tasks) |
| `journal` | date, checkbox per habit (gym, supplements, reading, meditation, water_2l, protein, creatine, learning), color (select: the palette's tokens, M12); diary text in `_body` | write (Diary → Today and Days since M12 part 8; Gallery and Habits retired by seed migration 20, habit icons in `settings.habitIcons`) |
| `ideas` | stage (spark/exploring/building/parked), area, next step | table, board by stage, gallery |
| `wealth` | type (liquid/investments/stocks/house/assets/debt), value (money), updated; history in `_body` | wealth dashboard, table |
| `leetcode` | number, difficulty, topic, status (queued/practicing/review/solved/skipped), solved_at, notes; since M12 list (blind75/neetcode150/grind169/amazon/contest/other), pattern, url, attempts, minutes, review_on | progress dashboard, table; the project's Problems tab |
| `payments` | kind, amount, approx, category and account (money's lists through `optionsFrom`), due, repeat, notify_days, autopay, active | upcoming, table |
| `notes` | folder (text, `/`-separated), url, source (owner/agent/radar/import), color (select, M12); the Markdown in `_body` | Notes → Notes (gallery by topic, table) |
| `radar` | url, source, interests (comma-separated), why, found_at (date and time), status (new/saved/dismissed), note (ref); the agent's summary in `_body`. Agents add; the writer refuses a missing or unsafe url, a missing why, a duplicate url and more than 50 a day per agent. Data-only since M12 (nothing shows it); `settings.radarInterests` was cleared by seed migration 22 | table |
| `reminders` | due (date with time), repeat (none/daily/weekly/monthly/yearly), done; hidden `_repeatFrom` (the series start while a snooze or a month-end clamp moves `due` off it) | table, calendar |
| `flows` (hidden) | status, definition (json `flow`), author | table |
| `proposals` (hidden) | target, action (delete), reason, agent, status (pending/approved/declined), decided | table |

Projects (`projects`, `parts`, the hidden `runs`) was retired on 2026-11-08: seed migration 24 marked them and their items deleted and archived the `project` and `part` refs above, whose values stay.

Hidden collections stay out of navigation and out of agents' reach except through their own tools (`save_flow`, `propose_delete`).

## Client

- **Lock screen:** with no token on the device the app renders only the Cave mark, a token field and Unlock; the token is checked with `GET /api/status` before it is kept. Any 401 later drops the token and returns to the lock screen. Settings has "Lock this device" (keeps the local copy) and "Forget this device" (also deletes the IndexedDB copy and the offline caches).
- **Routes:** `/` opens on `LANDING` (`/money/overview`); `/<section>/<tab>` for Money, Calendar, Flows, Ideas, Notes, Tasks and Settings, from one registry (`web/src/app/sections.ts`); `/ideas/all` and `/ideas/leetcode`; `/notes/all/<note>` and `?view=table`, `/notes/write?day=` (Today) and `/notes/days?day=` (a day in the reader); `/calendar/month`, `/calendar/reminders`, `/calendar/routine`; `/money/transactions?month=&chip=&group=&category=&account=&q=`; `/flows/<id>` one flow open in the inspector beside the canvas (`?do=approve|reject` asks the owner to confirm), `/flows/jobs/<id>` a built-in job there, `/flows/runs?source=`; `/settings/devices/<sub>` (Schedules, Jobs, Notifications); `/settings/data/<collection>/<view>` for raw collections; `/r/:id` (a reminder from a notification; `?do=done|snooze60` acts once). Every older path (`/c/...`, `/agents`, `/ai/...`, `/life/...`, `/system`, `/settings/system`, `/settings/flows`, `/settings/lists`, `/projects/*` (retired: Ideas, LeetCode and Notes keep their homes, the rest opens the landing page), `/flows/list`, `/diary*`, `/tasks/calendar`, `/calendar/agenda`, `/calendar/week`, `/money/wealth`) redirects to its new home and keeps the query string. Shortcut `C` opens the calendar; ⌘K / Ctrl+K opens the Ask sheet, N a note.
- **Rail and dock:** a 52 px icon rail with New (+) under the mark and Settings at the bottom (Show names widens it to 184 px with the labels: `web/src/app/rail.ts`, `localStorage` key `cave.rail`, a class on `<html>` set before the first render); under 768 px, a floating dock (two sections, New, two sections, More); `settings.dock` holds the four; More lists every section and edits the dock, as does Settings → General.
- **Boards:** one "New task" (or "New item") button adds to the first column; the tasks board hides Done and Dropped until Show done (`web/src/app/board-closed.ts`, per device), and a "No status" column shows only while it holds something; cards drag between and within columns on mouse and touch (long press), and move with the arrow keys; the order is a hidden `_order`; on a phone, columns are 80% wide and snap.
- **Money:** one money form (Money → Transactions → New entry, which stays open for the next receipt, and the New sheet): direction, amount, title, the direction's categories in a searchable select (`OptionPicker`, also the payment form and every category filter), the account unless only one is live (then it is taken without asking), and a date and time with Today and Yesterday. Transfers count as neither spending nor income. The item drawer offers a money item only its direction's categories plus the one it holds (`categoryChoices`). Transactions (`web/src/logic/ledger.ts`): one month or all time in the URL, chips (All, Expenses, Income, Transfers, Uncategorized: no category, or one no option holds), search, Group by day, category or account with subtotals, undated entries apart. Overview: Month or Year with arrows, four tiles (Spent, Income, Saved, Invested: transfers into `investment`) with their change against the previous period and a 12-month sparkline, the month day by day, where it went against last period (each a link into the ledger), twelve months stacked by the five biggest categories, top titles and the largest entries; filters in the URL. Undated entries are listed and counted apart, never filled in. Budget (`shared/budget.ts`): `settings.budget` holds a monthly limit and a saving target, typed by the owner (Overview's Budget tile or Settings → General, `BudgetFields`); the tile shows what is left and the pace, the server's hourly `budget` job notifies once per month at 80 % and 100 % of the limit (`server/notify/budget-sweep.ts`, keyed `budget:<month>:<share>` in the sent log), and `money_month` reports the same line.
- **Repeats and payments:** `shared/recurrence.ts` is the one engine for reminders, tasks and payments. A repeating task's Done moves it to its next date and brings it back as todo, from whatever column. Payments show in the calendar and Upcoming and have the `mark_paid` MCP tool; their Upcoming view is in Settings → Data only. Money → Subscriptions (`web/src/pages/Subscriptions.tsx`, the Payments tab's place) is one table of payments of kind subscription, through `shared/subscriptions.ts`: the plan (cost a month by repeat), the next charge computed from the stored date and its repeat (nothing is written), and the history from real expenses (linked by `payment`, or by name under the subscriptions category). Subscriptions don't notify (`server/notify/payment-sweep.ts` skips them); a flow's `date-arrives` trigger (`shared/flows/date-trigger.ts`) does it when the owner wants.
- **Agents and flows:** Settings → Agents (tokens, permissions, proposals, flows waiting for approval), Settings → Data (export, import through this device's write path, raw collections, the undo history of agents' writes), Flows (a section: one React Flow canvas with every flow and built-in job, `web/src/logic/flow-board.ts` laying out groups by trigger and a lane per flow from `flowGraph`, the inspector the only editor and the open flow's draft drawn until saved, Runs merging flow runs and job runs). The Cave shows what agents did through the change log; it holds none of their configuration (M10 retired the `ai` collection; its docs stay marked deleted).
- **Routine (M12 part 7, a guide since M13's follow-up):** `settings.routine` (`shared/routine.ts`, parsed field by field, at most 30 blocks): blocks that are fixed (days, start, minutes), daily (minutes, optional start) or weekly (minutes, times a week), each with an area (body, learn, rest, fun, other; none reads as other). Calendar → Routine (`web/src/pages/Routine.tsx`) is its only reader and editor: a column per weekday, the weekly blocks apart, minutes a week per area. It links to nothing: a habit link stored in M12 is dropped when read. Reminders: one form (`web/src/ui/ReminderForm.tsx`) and one table (`web/src/pages/Reminders.tsx`, `web/src/logic/reminder-list.ts`); Tasks → List is `web/src/pages/TasksList.tsx` (`web/src/logic/task-list.ts`).
- **Notes:** one Markdown renderer (`react-markdown`, no raw HTML, safe links only, `[[Title]]` links between notes, a ```` ```mermaid ```` block drawn by a cleaned renderer, `web/src/logic/diagram.ts`). The Notes section shows every live note (`web/src/logic/notes.ts`), grouped by `folder` as its topic, in one editor (`NoteEditor`). `/projects/notes*` and `/diary*` redirect into it. The `radar` collection is Data-only (`DATA_ONLY`): agents can still write it under its rules, nothing shows it.
- Item drawer: title, fields, Markdown body, saved on blur, history from the activity log.
- PWA: manifest with icons, service worker (network-first with a 3-second race against the cache for the app shell, never caches `/api`), `navigator.storage.persist()` on start.

## Visual tokens

The vivid palette (M14). The hex values live once in `shared/palette.ts` and as tokens in `web/src/styles.css`. `web/src/tokens.test.ts` keeps them equal and checks contrast: text 4.5:1 on every surface, status colours and swatches 3:1.

- **Surfaces:**
  - Colours: page `#0f1013`, sidebar `#0b0c0f`, panels `#15171b`, controls `#121418`, active and hover `#1c1f25`, lines `#22252c`.
  - Radius: 16 px for panels, 11 px for controls, pills fully round.
- **Text:**
  - Primary `#eceef2` (14 px, line height 1.5). Secondary and labels `#8b93a1`.
  - Labels are uppercase at 11.5 px.
- **Brand:**
  - The sunset gradient `#ff9a62 → #ff4f7e` with text `#2a0a12`, used on New, the dock's + and primary buttons.
  - Accent `#ff7f6e` for focus.
- **Status and marks:** the pre-M11 names (`--lime`, `--income`, `--expense`, `--cyan`, `--violet`, `--gold`) are aliases of these.
  - ok `#3ddc97`: income, done.
  - warn `#f5b94a`.
  - wait `#60a5fa`.
  - bad `#ff8a94`: expense, overdue.
  - vio `#a78bfa`, teal `#2dd4bf`, orange `#ff8a4c`, purple `#e879f9`.
- **Swatches:**
  - Sixteen (`SWATCHES`, tokens `--s-<name>`), the only choices in every colour picker: orange, amber, yellow, lime, green, teal, cyan, sky, blue, indigo, violet, fuchsia, pink, rose, red, grey.
  - Seed migration 25 gives each seeded category its own swatch.
- **Sections:**
  - Each has an emoji on a tile tinted with its colour: Money 💸 `#34d399`, Tasks ✅ `#60a5fa`, Calendar 📅 `#fb7185`, Notes 📝 `#a78bfa`, Flows ⚡ `#fbbf24`, Settings ⚙️ `#8b93a1`.
  - Tabs are pills. There are no descriptions under titles.
- **Fonts:**
  - Text: Inter, with `tabular-nums` for figures.
  - Headings and big figures: Space Grotesk.
  - Code: JetBrains Mono.
  - Diary: Newsreader.
- **The sidebar:**
  - 224 px with names. Collapsing it (per device) leaves 68 px of tiles, with the name shown on hover or focus.
  - Under 768 px it is replaced by the dock (Money, Tasks, +, Calendar, Notes) and ⚙️ "Everything" in each page's header.
- **Motion:**
  - A tab fades up in 180 ms. Sheets pop in on a desktop and rise from the bottom on a phone.
  - Buttons press to 0.97.
  - All of it is off under `prefers-reduced-motion`.
- **Icon:** "Arches", three white arches on the sunset gradient (`web/icons/icon.svg`, PNGs rendered from it).
- **Icons:** Lucide inline stroke SVG at 1.9 px, where an emoji can't go.
