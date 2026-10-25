# Cave

Local-first personal brain: money, tasks, habits, diary, projects and pages in one installable web app, with one MCP API any agent can use. Every device keeps a full offline copy and syncs with one server.

Status: pre-v0.1, live at `https://cave.alexjamesmx.dev`.

## Try it

Linux or WSL with git and [Bun](https://bun.com) 1.4.3:

```bash
bun install
bun run dev:seed
```

Open http://127.0.0.1:3000, unlock with `seed`, install the app from the address bar. The data is fake.

## Develop

```bash
bun run dev                    # dev server on data/cave.db
bun run check && bun test      # before every push: a push to main deploys
bun run e2e                    # browser checks when the UI changes
```

## Docs

- [docs/onboarding.md](docs/onboarding.md): how it fits together (diagrams), onboarding any machine, keys, costs.
- [AGENTS.md](AGENTS.md): rules and commands for anyone, human or agent, working here.
- [docs/guide.md](docs/guide.md): using the app.
- [docs/system.md](docs/system.md): what runs where, configuration, rebuilding any piece.
- [docs/architecture.md](docs/architecture.md): data model, sync, the client.
- [docs/hosting.md](docs/hosting.md): the VPS runbook.
- [docs/agents.md](docs/agents.md): connecting Claude, Codex, OpenCode.
- [docs/decisions.md](docs/decisions.md): why things are the way they are.
