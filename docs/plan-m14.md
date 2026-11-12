# M14 · The redesign

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a cleaner, livelier Cave that is quicker to use on the phone and the desktop, with fewer options. Money is the main pain.

**Architecture:**
- New tokens and fonts, a sidebar with emoji tiles, and a fixed phone dock.
- Each area is redesigned in its own files, with its CSS in `web/src/styles/<area>.css`.
- Two seed migrations: vivid colours, and Ideas becoming notes.
- No new server API.

**Tech stack:** Bun 1.4.3, React 19, Dexie, plain CSS. Adds `@fontsource-variable/inter` 5.3.0.

**Spec:** the owner approved the design canvas "Cave redesign" (ten boards) on 2026-11-12, plus these answers:
- LeetCode moves into Notes.
- Routine stays, with only its UI improved.
- The icon is A, "Arches".

The mockups are the reference for every page: `Main`, `Overview`, `Categories`, `Board`, `Calendar`, `Notes`, `PhoneMoney`, `PhoneEntry`, `PhoneCalendar` and `Icons`.

## What the owner can do, page by page

This list is the acceptance test, and it becomes `docs/guide.md`.

**Everywhere**
- **Sidebar** (desktop): emoji tiles for 💸 Money, ✅ Tasks, 📅 Calendar, 📝 Notes and ⚡ Flows, with ⚙️ Settings at the bottom.
  - "+ New ⌘K" sits on top and the sync state at the bottom.
  - It can be collapsed to tiles only.
- **Dock** (phone): Money, Tasks, a raised +, Calendar and Notes.
  - The ⚙️ in the page header opens every section, including Flows and Settings.
- **New** (+, ⌘K, N): Money, Task, Reminder, Subscription or Note, each a short form.
- **Page titles:** a section shows its title and tabs. There are no description lines.

**Money**
- **New entry:**
  - Type the amount first, then pick Expense or Income.
  - Tap a category from the emoji grid, then an account chip. The last used account is preselected and there is no "No account".
  - When: Today, Yesterday or Other.
  - The title is optional.
  - Save reads "Save −$245 · Food".
- **Transactions:**
  - **Scope:** one month or one year. A year scope runs from 1 January to today.
  - **Search:** matches title, note, category, account and amount (`245`, `$1,225`).
  - **Chips:** All, Expenses, Income, To review. To review means no category or no account.
  - **Rows:** on a fixed grid, grouped by day. On the phone they are bank-style cards.
  - **Edit:** tap a row to edit it.
- **Overview:**
  - **Scope:** Month or Year.
  - **Totals:** Spent, Came in, Saved, Budget left.
  - **Panels:** "Where it went" and "Day by day", the same height, side by side. The 12 months run underneath.
  - **Year links:** a category in Year opens Transactions for that year only.
- **Subscriptions:**
  - What runs and what it costs a month and a year.
  - **Paid** logs this charge as an expense, linked, with the subscription's amount, category and account.
- **Net worth:** unchanged apart from the style.
- **Categories:**
  - **Tabs:** Expenses, Income, Transfers, Accounts.
  - **Row:** drag, emoji, name, colour (16 swatches), entry count, delete.
  - **Delete:** asks where its N entries go (another category, or To review). Undo appears for 8 seconds.

**Tasks**
- **Board:**
  - **Columns:** To do, Doing and Waiting. Each fills the screen height.
  - **Drop:** a card can be dropped anywhere in a column. Below the last card puts it at the end.
  - **Add:** the + in a column header and "+ Add a task" at the bottom add a task to that column.
  - **Due:** relative ("Overdue · 1 day", "Today · 17:00").
  - **Priority:** shows only when high (🔥).
- **List:** unchanged apart from the style.

**Calendar**
- **Month:**
  - **Grid:** typed pills per day: 🔔 reminder, ✅ task, 💳 payment.
  - **Upcoming panel:**
    - quick add "Remind me to…" with Today, Tomorrow, Pick and a time;
    - groups Overdue, Today, Tomorrow, This week and Later;
    - single-line rows that end in "…", with the panel scrolling inside.
- **Agenda** (was Reminders):
  - **Items:** everything with a date, in the same groups as Upcoming.
  - **✓ per type:** marks a reminder or task done, or a payment paid.
  - **Counts:** match Upcoming.
- **Routine:** the same features, in the new look.

**Notes**
- **Notes:**
  - **Topics sidebar:** All, 📥 Inbox (no topic), 💡 Ideas, then the owner's topics.
  - **Capture bar:** type and press Enter to save a note in the open topic. `/` focuses search.
  - **Cards:** a masonry of cards tinted by topic.
  - **Open:** a card opens the editor, as today.
- **Ideas:** every idea is a note in topic Ideas, and nothing is lost.
- **Today, Days:** the diary, unchanged apart from the style.
- **LeetCode:** the LeetCode table, moved from Ideas.

**Flows, Settings:** unchanged apart from the style.

## Global constraints

- **Tokens:**
  - **Surfaces:** bg `#0f1013`, side `#0b0c0f`, panel `#15171b`, on `#1c1f25`, control `#121418`, line `#22252c`, control-border `#2a2e36`.
  - **Text:** text `#eceef2`, muted `#8b93a1`.
  - **Contrast:** the existing AA tests keep passing.
- **Swatches (16):** orange `#ff8a4c`, amber `#f59e0b`, yellow `#facc15`, lime `#a3e635`, green `#34d399`, teal `#2dd4bf`, cyan `#22d3ee`, sky `#38bdf8`, blue `#60a5fa`, indigo `#818cf8`, violet `#a78bfa`, fuchsia `#e879f9`, pink `#f472b6`, rose `#fb7185`, red `#f87171`, grey `#8b93a1`.
- **Money and status colours:** income `#3ddc97`, expense `#ff8a94`, warn `#f5b94a`.
- **Brand:**
  - Gradient `#ff9a62 → #ff4f7e` with text `#2a0a12`.
  - Section colours: Money `#34d399`, Tasks `#60a5fa`, Calendar `#fb7185`, Notes `#a78bfa`, Flows `#fbbf24`, Settings `#8b93a1`.
- **Fonts:**
  - **Text:** Inter.
  - **Headings and big figures:** Space Grotesk.
  - **Figures:** `tabular-nums`.
  - **Code:** JetBrains Mono.
  - **Diary:** Newsreader.
- **Copy:** the UI copy stays in English. No section or tab descriptions, and no explanatory paragraphs under titles.
- **Motion:**
  - Pages fade up in 180 ms and sheets rise in 220 ms. Buttons press to 0.97.
  - Everything is off under `prefers-reduced-motion`.
- **Phone:** 390 px wide, with no horizontal page scroll and touch targets of at least 40 px.
- **Data:**
  - Nothing is hard-deleted, and every write goes through `local.write`, so it is logged and can be undone.
  - The UI never guesses a category. The account is preselected but visible, and only in the form.
  - Imports and agents are unchanged.
- **Repo:** made-up figures only in tests and docs.

## Review focus

1. **Deleting a category used by 0 entries:** no dialog, just Undo.
   - Deleting one used by entries and choosing "To review" clears their `category`, and they show under To review.
2. **No accounts at all:** the form shows "Add an account" and Save stays disabled until there is one.
   - An archived last used account is never preselected.
3. **Searches:**
   - `1,225` and `$1225` both match an amount of 1225.
   - A category label such as "Health & gym" matches "health".
   - Searching in a year scope searches the whole year.
4. **Dragging a card onto the empty area of a short column** appends it to that column. Dragging inside the same column still reorders it.
5. **The Ideas migration on a database with no ideas** writes nothing. Running it twice never duplicates notes, because the note id is derived from the idea id.

---

### Task 1: Foundation (tokens, shell, dock, icon, motion)

**Files:**
- **Shared:** `shared/palette.ts`, `shared/categories.ts`, `shared/seed.ts` (migration 25), `shared/seed.test.ts`.
- **Shell and tokens:** `web/src/styles.css`, `web/src/tokens.test.ts`, `web/src/main.tsx`.
- **Navigation:** `web/src/app/sections.ts` and its test, `web/src/app/rail.ts`, `web/src/ui/Shell.tsx`, `web/src/ui/Dock.tsx`, `web/src/pages/SectionPage.tsx`.
- **Icon and manifest:** `web/icons/*`, `web/index.html`, `web/manifest.webmanifest`.
- **Tests and config:** `e2e/dock.e2e.ts`, `playwright.config.ts` (`CAVE_E2E_PORT`).
- **Created:** `web/src/styles/{money,tasks,calendar,notes}.css`, which start empty.

**Interfaces:**
- `Section` gains `emoji: string`, and its `color` becomes a hex.
- `Tab` loses `description`.
- `PALETTE` keeps its keys with the vivid values.
- `SWATCHES` (16 named hexes) moves to `shared/palette.ts`, and `web/src/logic/options.ts` reads it.
- `recolourMigration(get, map)` takes the map.

- [ ] **Tests first:**
  - `tokens.test.ts`: swatches equal `SWATCHES` and the surfaces pass AA.
  - `seed.test.ts`: migration 25 turns each `CATEGORY_SET` value whose colour is still the M11 seed colour into its new colour, leaves owner-changed colours alone, and maps every other palette A colour.
  - `sections.test.ts`: there is no `description`, every section has an emoji, and the dock is fixed to money, tasks, calendar and notes.
- [ ] **Implement:**
  - **Shell:**
    - Sidebar 224 px with emoji tiles, collapsible to 64 px, open unless `cave.rail` is `narrow`.
    - Pill tabs and an emoji header.
    - On the phone, a ⚙️ "Everything" sheet replaces More, and Edit dock is removed (`settings.dock` is ignored).
  - **Icon:** icon A in SVG, plus PNGs 192, 512 and maskable rendered with headless Chrome. `theme-color` is `#0f1013`.
  - **Base styles:** buttons, inputs, panels, chips, tables, sheets, toast, and motion.
- [ ] **Verify:** `bun run check`, `bun test`, `bun run e2e`. Commit.

### Task 2: Money

**Files:**
- **Form and pickers:** `web/src/ui/MoneyForm.tsx`, `AccountPicker.tsx`, `OptionsEditor.tsx`.
- **Pages:** `web/src/pages/Transactions.tsx`, `MoneyLists.tsx`, `Subscriptions.tsx`, `web/src/views/MoneyDashboard.tsx`.
- **Logic:** `web/src/logic/ledger.ts` and its tests, plus a new `web/src/logic/category-delete.ts` with its test.
- **Styles and e2e:** `web/src/styles/money.css`, and `e2e/money*.e2e.ts`, `subscriptions.e2e.ts`.

**Interfaces:**
- `LedgerQuery.month` accepts `YYYY` (a year scope).
- `matchesSearch(doc, fields, q): boolean`.
- `deleteCategoryPlan(options, items, value, moveTo?: string) => { options, patches: {id, patch}[] }`.
- `lastAccount(items, offered): string | undefined`.

- [ ] **Tests:** each Review focus item 1–3 as a unit test, plus the Year → link `month=YYYY`.
- [ ] **Implement:** the Money items listed above, matching the mockups. Remove the inline explanatory paragraphs.
- [ ] **Verify:** check, test, and the money e2e. Commit.

### Task 3: Tasks board

**Files:** `web/src/views/BoardView.tsx`, `web/src/logic/board.ts` and its test, `web/src/styles/tasks.css`, `e2e/tasks.e2e.ts`.

- [ ] **Test:** `dropIndex` appends a card dropped below the last one or on an empty column.
- [ ] **Implement:** full-height columns, the header + and the bottom add, relative due dates, and the high-priority-only pill.
- [ ] **Verify** and commit.

### Task 4: Calendar, Agenda, Routine

**Files:**
- **Pages:** `web/src/pages/Calendar.tsx`, `Reminders.tsx` (becomes the Agenda), `Routine.tsx`.
- **Logic:** `web/src/logic/reminder-list.ts` → `agenda.ts`, with its test.
- **Navigation:** `web/src/app/sections.ts` (tab `agenda`) and `web/src/app/router.ts` (redirect `/calendar/reminders`).
- **Styles and e2e:** `web/src/styles/calendar.css`, `e2e/reminders.e2e.ts`, `routine.e2e.ts`.

**Interfaces:** `agenda(reminders, tasks, payments, now, zone) => {group, items: AgendaItem[]}[]`, where `AgendaItem = {id, type: "reminder"|"task"|"payment", title, at, done(): patch}`.

- [ ] **Test:**
  - Grouping and counts across the three types.
  - Overdue counts payments and tasks too.
- [ ] **Implement:**
  - Month and the Upcoming panel.
  - The Agenda tab with quick add.
  - The Routine restyle.
- [ ] **Verify** and commit.

### Task 5: Notes, with Ideas and LeetCode

**Files:**
- **Shared:** `shared/seed.ts` (migration 26) and its test.
- **Pages:** `web/src/pages/Notes.tsx`, `web/src/logic/notes.ts`. Delete `web/src/pages/Ideas.tsx`.
- **Navigation:** `web/src/app/sections.ts` (Ideas section gone, LeetCode tab in Notes) and `router.ts` (redirect `/ideas/*`).
- **Styles and e2e:** `web/src/styles/notes.css`, `e2e/notes.e2e.ts`.

- [ ] **Test:**
  - Migration 26: every live idea becomes a note in topic `Ideas`. Every non-empty idea field ends up in the note body.
  - The idea is marked deleted, and the ideas collection is retired like migration 24 did with projects.
  - Running it twice changes nothing.
- [ ] **Implement:**
  - The Notes page: topics, capture bar, masonry and tint.
  - The LeetCode tab.
  - The redirects.
- [ ] **Verify** and commit.

### Task 6: Integrate and ship

- [ ] **Merge:** bring the area branches into `m14-redesign`.
- [ ] **Verify:** the full `bun run check`, `bun test` and `bun run e2e`.
- [ ] **Phone pass:** screenshots at 390 px and 1440 px of every page, fixing overflow.
- [ ] **Docs:**
  - `docs/guide.md` is rewritten from the list above.
  - `docs/decisions.md` gets the rows that supersede earlier ones: archive-only categories, entries without an account, palette A, the Ideas section, and no Paid on subscriptions.
  - `docs/architecture.md` (tokens) and `AGENTS.md` (Status) are updated.
- [ ] **Review:** a code review of the whole branch, and its findings fixed.
- [ ] **Ship:**
  1. Open the PR (it names migrations 25 and 26 on their own line) and merge it.
  2. Tag `m14-history`, then delete this plan and the log.
  3. Watch the deploy.
