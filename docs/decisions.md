# Decisions

Append-only. Newest last. Change a decision by adding a new entry that supersedes it.

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | Build a custom PWA instead of extending Obsidian for structured records | Obsidian worked for text but was hard to keep up with for money, tasks and habits; a visual, customisable app was wanted |
| 2026-10-12 | Records live in an app database (SQLite on the server, full copy in IndexedDB per device) | Offline writes on the phone and hosting are simple; files-as-database would need the vault on every server |
| 2026-10-12 | Notes stay as Markdown in the Obsidian vault; the app reads them and only creates new files in `Inbox/` | Obsidian is the best editor available; Markdown is what agents read best; LiveSync has rolled back edits to existing files |
| 2026-10-12 | Bun for runtime, package manager, bundler and tests | One tool, already installed, native SQLite; no Node toolchain to maintain |
| 2026-10-12 | Custom per-field last-writer-wins sync instead of a hosted sync engine | One owner and a few devices; Electric and PowerSync need Postgres, LiveStore is pre-v1 |
| 2026-10-12 | Notion-style collections with editable fields and views; Money, Tasks, Journal, Ideas, Wealth, LeetCode, Projects, Reminders are seeded collections | New trackers without code |
| 2026-10-13 | Agents work through an MCP server and HTTP API with per-agent tokens, permissions and an undoable activity log; chat happens in external clients, not inside the app | The app is the memory; Claude, Codex, OpenCode or OpenClaw do the work |
| 2026-10-13 | Model-agnostic: AGENTS.md as the shared rules file, Agent Skills format, a provider adapter for in-app AI | The owner can switch or mix models |
| 2026-10-13 | Visual direction: dark, lime accent, Space Grotesk and JetBrains Mono, command-center home (see `docs/design/`) | Approved mockups |
