@AGENTS.md

## Claude Code

- MCP servers in `.mcp.json`:
  - `context7`: current library documentation. Use it before writing code against any library API.
  - `exa`: web search for current facts. Cite sources.
  - `firecrawl`: turn a page or site into clean Markdown.
  - `github`: issues, pull requests, Actions.
  - `playwright` (user scope, added by `setup/setup.ps1`): drive a browser to test the PWA.
- Use plan mode for changes that touch more than one module.
- Plugins installed by setup: superpowers, feature-dev, code-review, commit-commands, security-guidance, skill-creator, claude-md-management.
