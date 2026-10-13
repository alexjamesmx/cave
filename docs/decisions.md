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
| 2026-10-12 | M1 tooling: exact-pinned dexie 4.4.6, typescript 7.0.2, @biomejs/biome 2.5.15, @types/bun 1.4.3; `bun.lock` committed; `.gitattributes` forces LF | Reproducible installs; Biome formats LF and the machine has `core.autocrlf` on |
| 2026-10-12 | `fake-indexeddb` 6.2.5 (dev only) runs the Dexie client store under `bun test` | Bun has no IndexedDB; Dexie's docs name it for non-browser runtimes |
| 2026-10-12 | React is added in M2, not M1 | M1 has no UI; no unused dependency |
| 2026-10-12 | HLC: `next()` takes max(wall, last)+counter; `observe()` moves the clock to the max remote stamp seen on every pull; counter overflow past 9999 carries into ms; clock state persists in IndexedDB `meta` | Owner requirement; a device with a slow clock still orders its next edit after what it has seen |
| 2026-10-12 | Equal stamps with different values tie-break on the larger JSON encoding | Only a misbehaving client can cause it, but it keeps merge commutative |
| 2026-10-12 | Sync limits: pull pages of 1000 docs (cursor = last seq sent, client loops until a short page); push at most 1000 docs and 8 MiB per request; client pushes in batches of 200 | Owner requirement for paging; bounded request size |
| 2026-10-12 | `seq` is taken from the `changes` log row (AUTOINCREMENT) inside `.immediate()`, only when the merge changed a key | A doc's seq always equals its newest log row; re-sends do not bump it |
| 2026-10-12 | Server overrides `actor` with `user:<deviceId>`; seed rows use actor `seed` | Clients cannot claim another actor; seed is distinguishable in the activity log |
| 2026-10-12 | `write` view type for the journal's diary editor (accepted in the M1 review) | The plan lists a "write" view but had no type for it |
| 2026-10-12 | Server binds `127.0.0.1` unless `CAVE_HOST` is set, and refuses to start on a non-loopback host without `CAVE_TOKEN`; `JARVIS_TOKEN` renamed to `CAVE_TOKEN` | M1 review item 1 and 6: Bun's default is all interfaces |
| 2026-10-12 | Each local write and pull adopts the clock saved in IndexedDB `meta` inside the same rw transaction before stamping or saving | M1 review item 2: tabs on one device must never issue the same stamp |
| 2026-10-12 | `changes.before` holds `{key: {value, stamp} \| null}` for undo; schema changes go through an append-only migration list keyed on `PRAGMA user_version`; rows from before migration 2 have `before = null` (not recorded); a database newer than the build is refused | M1 review item 3 |
| 2026-10-12 | Sync rejects a request with any stamp more than 10 minutes ahead of server time: 400 `{error: "clock ahead", serverTime}` | M1 review item 4: a fast clock would win every merge and drag all clocks forward |
| 2026-10-12 | An `item` must have a `collection`; `collection` and `setting` docs must have `collection: null` | M1 review item 5 |
| 2026-10-12 | Date values are ISO 8601 local time, `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` when the field has `config.withTime`; a seeded `settings` doc holds `timezone`; `_created` is a UTC ISO string set by the client on a doc's first write; seed icons are Lucide names | M1 review answers to the open questions |
| 2026-10-12 | A `withTime` date field accepts `YYYY-MM-DD` as well as `YYYY-MM-DDTHH:mm[:ss]` | 61 vault ledger entries are date-only; owner approved at M2 planning |
| 2026-10-12 | Field values are checked on every write: `null` clears any field; keys that are not fields pass unchecked; the client refuses the write, the server rejects the sync request (400 naming the field); items of a collection the server has not stored yet are not checked | Outbox order does not promise collections first; unknown keys hold imported extras |
| 2026-10-12 | Importer keeps frontmatter keys that are not fields (journal `source`, `status`, `tags`; LeetCode `confidence`) unchanged in `data` and lists them in the report; ledger `bucket` is dropped as the plan says | Lossless import; owner approved at M2 planning |
| 2026-10-12 | `System/categories.json` only adds category names the seed lacks; its emoji icons are ignored in favour of Lucide names | Seed already has all nine names with Lucide icons; owner approved at M2 planning |
| 2026-10-12 | Frontmatter `created` without a zone is local time in the `settings` timezone, converted to UTC for `_created` | `_created` is UTC by decision; owner approved at M2 planning |
