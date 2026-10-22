# Cave

Open-source, local-first, multi-agent personal brain: money, tasks, habits, diary, ideas, learning and notes in one installable web app, with one API that any agent can use.

Status: pre-v0.1. How the whole system fits together (architecture, flows, local dev, rebuilding): [docs/system.md](docs/system.md). Agent instructions: [AGENTS.md](AGENTS.md).

## First run

You need [Bun](https://bun.com) 1.2.3 or later.

```bash
bun install
cp .env.example .env
```

Edit `.env`: set `VAULT_PATH` to your Obsidian vault. The other values can stay empty. Then:

```bash
bun run import
bun start
```

Open http://127.0.0.1:3000 in Edge and install the app (the install icon in the address bar). After one online visit it opens offline.

## Every day

- Start the server with `bun start` and leave it running.
- Every device keeps its own full copy and syncs with the server when it can reach it.
- To update: stop the server, `git pull`, `bun install`, `bun start`.

## Backups

- **Automatic.** The server takes a backup when it starts, if the newest is more than a day old, and checks again every hour.
  - Each backup is a full SQLite copy, checked with `integrity_check` before it counts. A copy that fails is renamed `*.failed` and kept.
  - It keeps the newest 14, plus the newest of each of the last 12 months, and deletes only older backup files.
- **Where.** `data/backups/`, or the folder in `BACKUP_DIR`, for example a OneDrive folder for a copy off this machine.
  - File names are UTC times: `cave-2026-10-13T1405.db`.
  - **Backups hold everything, every amount and note, unencrypted. Keep them in a private place.**
- **By hand.** `bun run backup` takes one now, even while the server runs.
- **Restore.** Stop the server, then `bun run restore <backup file>`.
  - Restore is for a lost or broken server. It does not roll data back: devices push everything newer than the backup straight back. To reverse a change, use Undo on the Agents page (agent writes) or set the value back from the item's history in its drawer.
  - The current database is renamed `cave.db.before-restore-<time>`, never deleted.
  - The restored database gets a new id. On their next sync, devices push back anything newer than the backup.
- **Export.** `bun run export` writes every record as JSON to `data/exports/`. Settings → "Download export" does the same from any device.

## New vault notes

On start, the server checks the vault and prints `Vault has N new notes: run bun run import` when there are notes it doesn't hold yet. Settings shows the same count.

It never imports on its own: a note renamed in Obsidian would come back as a duplicate. `bun run import` only adds; it never edits or deletes, and never writes to the vault.

## Agents

Claude Code, Codex and OpenCode connect through the MCP server at `/mcp`, each with its own token. See [docs/agents.md](docs/agents.md).

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
- **Home → Ask:** ask or tell the Cave anything. It opens Claude with the question (also copied), and Claude reads and writes the Cave through its connector. Expense and Task are quick forms next to it.
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

## Hosting

The Cave can run on a VPS as the server every device syncs with. Today that is a Hostinger KVM 2 on Ubuntu 26.04, at `https://cave.alexjamesmx.dev`, behind Caddy. The laptop and the phone become clients.

- **DNS:** A and AAAA records for `cave` point at the VPS. The rest of the zone (the portfolio, mail) is untouched.
- **First-time setup:** `docs/hosting.md`, a numbered runbook:
  - a `cave` user;
  - Bun 1.4.3 in `/opt/bun`;
  - a read-only deploy key and the clone in `/opt/cave`;
  - `/etc/cave/cave.env` with a generated token;
  - Caddy, the firewall, key-only SSH and the systemd service;
  - the `cave-deploy` wrapper and its timer (step 11).
- **Deploying happens on merge.** Every 2 minutes `cave-deploy.timer` on the VPS looks at `main`. It first takes a verified backup of the database, named after the commit about to ship (`/var/lib/cave/backups/pre-deploy`, newest five kept). A new tip is then built in its own release directory as `cave` (which has no sudo rights), with `bun install --frozen-lockfile`, `bun run check` and `bun test`.
  - Only if all three pass is the `current` symlink switched and the service restarted; the newest five releases are kept.
  - The restarted server must report the new commit on `/api/status` within 20 seconds, or the VPS rolls back by itself.
  - A commit that failed or was rolled back is held: the timer leaves it alone until a newer commit lands.
  - Settings shows the last deploy: the running commit, or the step that failed.
- **Deploying now:** `bun run deploy` from the laptop, on a clean tree whose `HEAD` is the tip of `origin/main`. It runs `cave-deploy now` over SSH (which also retries a held commit), then checks the public URL. It needs `CAVE_REMOTE_URL`, `CAVE_REMOTE_TOKEN` and, optionally, `CAVE_SSH` (default `cave-vps`) in the laptop's `.env`.
- **Rolling back, from the phone:**
  1. A deploy that fails its health check rolls back by itself.
  2. For a bug in a healthy deploy, ask a Claude Code cloud session to revert the PR, then merge the revert.
  3. In an emergency, open hPanel's browser terminal and run `cave-deploy rollback`. From the laptop, `bun run deploy --rollback` does the same.
- **Changing code from the phone:** the Code tab of the Claude app runs cloud sessions on this repo in the `cave` environment. They push a branch and open a PR; the owner merges. See AGENTS.md "Cloud sessions".
- **Backups:**
  - **On the VPS:** the server backs itself up to `/var/lib/cave/backups`, with the same verification and retention as on the laptop.
  - **On the laptop:** `bun run pull-backups` copies new ones into `BACKUP_PULL_DIR` with `scp` and verifies each. It never deletes anything on the VPS. To run it daily, add a cron entry or systemd user timer in the laptop's WSL Ubuntu that runs `bun run pull-backups` in `~/code/jarvis` (optional).
  - **Hostinger:** it also keeps weekly snapshots of the whole VPS (hPanel → VPS → Backups).
- **Restoring on the VPS:**
  1. `systemctl stop cave`;
  2. run `bun run restore <file>` as `cave` (the command is in `docs/hosting.md`, step 9);
  3. `systemctl start cave`.
- **Devices and agents:**
  - open `https://cave.alexjamesmx.dev`, unlock it with the server token, and install the app;
  - agents use `https://cave.alexjamesmx.dev/mcp` with their own token (`docs/agents.md`); Claude's desktop and phone apps through a custom connector (`docs/agents.md` "Claude apps").

## Developing

`bun run dev` runs the server in development mode. `bun run check` runs the type check and lint, `bun test` the tests, and `bun run e2e` the browser checks against the installed browser (Google Chrome in WSL, Edge on Windows). All commands: [AGENTS.md](AGENTS.md).

### Machine setup (WSL Ubuntu, the laptop's default)

The laptop works in WSL Ubuntu at `~/code/jarvis`: tools, SSH to the VPS, the MCP variables and Remote Control are in [docs/system.md](docs/system.md) section 6, "A new development laptop".

### Machine setup (Windows-native)

Double-click `setup/setup.cmd`. It:

1. Installs Git, Node.js LTS, Bun and Claude Code if missing.
2. Asks for API keys and stores them as user environment variables: Context7, Exa, Firecrawl, a GitHub fine-grained token.
3. Installs global Claude rules to `~/.claude/CLAUDE.md` (keeps yours if it exists).
4. Adds the Playwright MCP server and the Claude Code plugins.
5. Writes `.mcp.json` and `.claude/settings.json` from the templates in `setup/` if they don't exist.
6. Initialises the git repository and turns on the commit-message hook (`git config core.hooksPath .githooks`; see "Git" in AGENTS.md).

Then open a terminal here, run `claude`, approve the project MCP servers and check them with `/mcp`.
