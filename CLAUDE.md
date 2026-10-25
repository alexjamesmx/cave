@AGENTS.md

## Claude Code

- MCP servers (`.mcp.json`, keys from the environment: `docs/onboarding.md`):
  - `context7`: current library docs; use before coding against a library API.
  - `exa`: web search for current facts; cite sources.
  - `firecrawl`: a page or site as Markdown.
  - `github`: issues, PRs, Actions.
  - `cave` / `cave-dev`: the Cave's MCP, production / local dev server (`docs/agents.md`).
  - `playwright` (user scope, from `setup/setup.sh`): drive a browser.
- Plugins from `setup/setup.sh`: superpowers, feature-dev, code-review, commit-commands, security-guidance, skill-creator, claude-md-management.
- Project skills: `.claude/skills/` (`ship-change`).
- Plan mode for changes across more than one module.
