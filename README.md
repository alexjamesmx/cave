# Cave

Open-source, local-first, multi-agent personal brain: money, tasks, habits, diary, ideas, learning and notes in one installable web app, with one API that any agent can use.

Status: pre-v0.1, live at `https://cave.alexjamesmx.dev`. Every device keeps a full offline copy and syncs with that server; agents connect through its MCP endpoint.

## Try it locally

You need Linux (or WSL) with git and [Bun](https://bun.com) 1.4.3.

```bash
bun install
bun run dev:seed
```

Open http://127.0.0.1:3000, unlock with the token `seed`, and install the app from the browser's address bar. The data is fake (`data/seed.db`).

## Develop

```bash
bun run dev                          # development server on data/cave.db, or CAVE_DB_PATH
bun run check && bun test            # before every push: a push to main deploys
bun run e2e                          # browser checks, when the UI changes
```

A new machine: `docs/system.md` section 6. Every command and the rules for working in this repo: [AGENTS.md](AGENTS.md).

## Docs

- [docs/guide.md](docs/guide.md): using the app.
- [docs/system.md](docs/system.md): how the whole system fits together, local dev, configuration, rebuilding any piece.
- [docs/architecture.md](docs/architecture.md): data model, sync protocol, seed collections, the client.
- [docs/hosting.md](docs/hosting.md): the VPS runbook (Caddy, systemd, deploy on merge, off-box backups).
- [docs/agents.md](docs/agents.md): connecting Claude Code, Codex, OpenCode and the Claude apps.
- [docs/decisions.md](docs/decisions.md): why things are the way they are.
