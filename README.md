# Cave

Open-source, local-first, multi-agent personal brain: money, tasks, habits, diary, ideas, learning and notes in one installable web app, with one API that any agent can use.

Status: pre-v0.1. Agent instructions: [AGENTS.md](AGENTS.md).

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

## Developing

`bun run dev` runs the server in development mode. `bun run check` runs the type check and lint, `bun test` the tests, and `bun run e2e` the browser checks against the installed Edge. All commands: [AGENTS.md](AGENTS.md).

### Machine setup (Windows)

Double-click `setup/setup.cmd`. It:

1. Installs Git, Node.js LTS, Bun and Claude Code if missing.
2. Asks for API keys and stores them as user environment variables: Context7, Exa, Firecrawl, a GitHub fine-grained token.
3. Installs global Claude rules to `~/.claude/CLAUDE.md` (keeps yours if it exists).
4. Adds the Playwright MCP server and the Claude Code plugins.
5. Writes `.mcp.json` and `.claude/settings.json` from the templates in `setup/` if they don't exist.
6. Initialises the git repository and turns on the commit-message hook (`git config core.hooksPath .githooks`; see "Git" in AGENTS.md).

Then open a terminal here, run `claude`, approve the project MCP servers and check them with `/mcp`.
