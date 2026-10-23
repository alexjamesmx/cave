# Architecture

Design reference: `docs/design/*.html` (open in a browser; static copies of the approved mockups). Visual tokens are listed at the end of this file. How the pieces are hosted and how code and data move between them: `docs/system.md`.

## Shape

```
web (PWA, React) ──IndexedDB (Dexie, full copy)──┐
                                                 │ POST /api/sync (push outbox, pull since cursor)
server (Bun.serve) ── bun:sqlite data/cave.db ◄──┘
   ├── /api/*   owner API (status, export, history, activity, system, flows, notifications, push, money review, agents)
   ├── /mcp     MCP server for agents (per-agent tokens)
   └── jobs     30-second loop: reminder and payment sweeps, flows, Telegram polling, the backup check
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
| `tasks` | status (todo/doing/waiting/done/dropped), priority (high/normal/low), due (with time), repeat, notify, area, completed, cancelled, project (ref), part (ref) | board by status, table, calendar by due |
| `journal` | date, checkbox per habit (gym, supplements, reading, meditation, water_2l, protein, creatine, learning); diary text in `_body` | write, gallery, habits dashboard |
| `ideas` | stage (spark/exploring/building/parked), area, next step, project (ref) | table, board by stage, gallery |
| `wealth` | type (liquid/investments/stocks/house/assets/debt), value (money), updated; history in `_body` | wealth dashboard, table |
| `leetcode` | number, difficulty, topic, status (queued/practicing/review/solved/skipped), solved_at, notes, project (ref) | progress dashboard, table |
| `projects` | status (active/paused/done/dropped), area, review (date), goal, template, pinned, map (json `map`: the Map's layout) | table, board |
| `parts` | project (ref), parent (ref), status, order, due, kind | table |
| `payments` | kind, amount, approx, category and account (money's lists through `optionsFrom`), due, repeat, notify_days, autopay, active, project (ref) | upcoming, table |
| `notes` | folder (text, `/`-separated), url, source (owner/agent/radar/import), project (ref); the Markdown in `_body` | table, gallery |
| `radar` | url, source, interests (comma-separated), why, found_at (date and time), status (new/saved/dismissed), note (ref); the agent's summary in `_body`. Agents add; the writer refuses a missing or unsafe url, a missing why, a duplicate url and more than 50 a day per agent | table |
| `reminders` | due (date with time), repeat (none/daily/weekly/monthly/yearly), done, project (ref); hidden `_repeatFrom` (the series start while a snooze or a month-end clamp moves `due` off it) | table, calendar |
| `flows` (hidden) | status, definition (json `flow`), author, project (ref) | table |
| `runs` (hidden) | project (ref), part (ref), agent, status, started_at, finished_at, steps (json); written only by the run tools | table |
| `proposals` (hidden) | target, action (delete), reason, agent, status (pending/approved/declined), decided | table |

Hidden collections stay out of navigation and out of agents' reach except through their own tools (`save_flow`, `start_run`, `propose_delete`).

## Client

- **Lock screen:** with no token on the device the app renders only the Cave mark, a token field and Unlock; the token is checked with `GET /api/status` before it is kept. Any 401 later drops the token and returns to the lock screen. Settings has "Lock this device" (keeps the local copy) and "Forget this device" (also deletes the IndexedDB copy and the offline caches).
- **Routes:** `/` Home; `/<section>/<tab>` for Money, Calendar, Tasks, Projects, Life and Settings, from one registry (`web/src/app/sections.ts`); `/projects/<id>/<tab>` (Overview, Map, Board, Activity, Items); `/settings/data/<collection>/<view>` for raw collections; `/r/:id` (a reminder from a notification; `?do=done|snooze60` acts once); `/settings/flows/:id` (`?do=approve|reject` asks the owner to confirm). Every older path (`/c/...`, `/agents`, `/flows`, `/ai/...`, `/system`, `/money/wealth`) redirects to its new home and keeps the query string. Shortcut `C` opens the calendar.
- **Home:** the Ask box opens Claude with the text (`claude.ai/new?q=`, the cave connector named on the first line, the question copied first; `web/src/logic/ask-claude.ts`). Quick actions open forms: Expense (any day), Task, Reminder (its "When" takes plain language through `shared/when.ts`, with a preview). The glance: Due (reminders, tasks and payments), spending this month with its daily rate, habits this week, flows waiting or run in 24 h, open tasks, net worth, LeetCode, the last sync and deploy.
- **Phone dock:** under 768 px, a floating dock (two sections, Ask, two sections, More); `settings.dock` holds the four; More lists every section and edits the dock.
- **Boards:** one "New task" (or "New item") button adds to the first column; cards drag between and within columns on mouse and touch (long press), and move with the arrow keys; the order is a hidden `_order`; on a phone, columns are 80% wide and snap.
- **Money:** one money form (Home, Money → New entry, the dock's Ask sheet): direction, amount, title, the direction's categories as an emoji grid, account, detail, and a date and time with Today and Yesterday. Transfers count as neither spending nor income. Dashboards: Month or Year with arrows and Compare to previous; filters in the URL; spending by category (pick one for its 12 months), the last 12 months of spending and income, the savings rate, top titles, fixed (payments) versus variable, and in the year view a month table and the biggest expenses. Undated entries are listed and counted apart, never filled in. `/money/review` approves the category review from `bun run money-review`.
- **Repeats and payments:** `shared/recurrence.ts` is the one engine for reminders, tasks and payments. A repeating task's Done moves it to its next date. Payments have an Upcoming view (30 days, total, overdue first, Paid with Undo, the subscription finder), show in the calendar and the Due card, and have the `mark_paid` MCP tool.
- **Agents and flows:** Settings → Agents (tokens, calls, undo) and Settings → Flows; Projects → Activity lists every run (agents', flows' and jobs'). The Cave shows what agents did; it holds none of their configuration (M10 retired the `ai` collection; its docs stay marked deleted).
- **Notes and radar:** one Markdown renderer (`react-markdown`, no raw HTML, safe links only, `[[Title]]` links between notes). The radar is fed by agents only; Save writes an Inbox note per finding.
- Item drawer: title, fields, Markdown body, saved on blur, history from the activity log.
- PWA: manifest with icons, service worker (network-first with a 3-second race against the cache for the app shell, never caches `/api`), `navigator.storage.persist()` on start.

## Visual tokens

Palette A (M11). The hex values live once in `shared/palette.ts` and as tokens in `web/src/styles.css`; `web/src/tokens.test.ts` keeps them equal and checks contrast (text 4.5:1 on every surface, status colours 3:1).

- Surfaces: page `#15171b`, rail `#111317`, panels `#1b1e24`, controls `#181b20`, active and hover `#22262e`, lines `#272b33`. Radius 10 px (panels) / 7 px (controls). No glows, gradients or grid behind content.
- Text `#e4e7eb` (13.5 px / 1.5), secondary and labels `#98a0ab`, labels uppercase 11 px with 0.06 em tracking.
- Accent sage `#8fd0a0` (text on it `#0f1a12`): focus, primary buttons, the active tab.
- Status and marks: ok `#8fd0a0` (on track, income, done), warn `#d9b56f`, wait `#8cb7dd`, bad `#e59aa4` (blocked, expense, overdue), vio `#a39be0`, teal `#7fc4cf`, orange `#d9a06f`, purple `#c9a3e0`. The pre-M11 names (`--lime`, `--income`, `--expense`, `--cyan`, `--violet`, `--gold`, `--orange`, `--purple`) are aliases of these.
- Sections: Money ok, Calendar bad, Flows warn, Projects vio, Diary wait, Tasks teal, Settings `#6b7380`.
- Fonts: Space Grotesk (UI), JetBrains Mono (numbers, tabular), Newsreader (diary).
- The rail: 52 px, icons only, the label beside the icon on hover or focus; under 768 px the dock replaces it.
- Icons: inline stroke SVG at 1.9 px; every collection, category, habit and field type has one.
