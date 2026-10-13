# Cave

Open-source, local-first, multi-agent personal brain: money, tasks, habits, diary, ideas, learning and notes in one installable web app, with one API that any agent can use.

Status: pre-v0.1, design approved, code in progress. Agent instructions: [AGENTS.md](AGENTS.md).

## Machine setup (Windows)

Double-click `setup/setup.cmd`. It:

1. Installs Git, Node.js LTS, Bun and Claude Code if missing.
2. Asks for API keys and stores them as user environment variables: Context7, Exa, Firecrawl, a GitHub fine-grained token.
3. Installs global Claude rules to `~/.claude/CLAUDE.md` (keeps yours if it exists).
4. Adds the Playwright MCP server and the Claude Code plugins.
5. Writes `.mcp.json` and `.claude/settings.json` from the templates in `setup/` if they don't exist.
6. Initialises the git repository.

Then open a terminal here, run `claude`, approve the project MCP servers and check them with `/mcp`.
