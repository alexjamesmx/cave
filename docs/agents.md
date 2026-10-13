# Connecting agents

Agents use the Cave through its MCP server at `/mcp` (Streamable HTTP). Each agent has its own token, so every action in the activity log names who did it. Agents never touch the database file.

## 1. Mint a token, one per agent

```bash
bun run agent add claude-code --scopes read,write
bun run agent add codex --scopes read --collections money,tasks
bun run agent list
bun run agent revoke codex
```

- The token (`cave_…`) is printed once. Only its SHA-256 is stored, so it can't be shown again. A lost token means revoking the agent and adding a new one.
- Scopes:
  - `read`: `list_collections`, `query`, `get`, `money_month`.
  - `write`: `create`, `update`, `propose_delete`, and `add_note` (only when `VAULT_PATH` is set).
- `--collections` limits what the agent can see. Other collections don't appear in its lists, and anything in them answers "not found".
- Keep the token in an environment variable, `CAVE_AGENT_TOKEN` below. Never put it in a committed file.

## Rules every agent gets

- **Amounts, categories and accounts:** never guess them. A value that isn't one of a field's options is refused; ask the owner or leave the field out.
- **Deletes:** agents can't delete. `propose_delete` puts a proposal on the Agents page, and the owner approves or declines it.
- **Undo:** every agent write can be undone from the Agents page. A key the owner changed afterwards is kept.
- **Notes:** `add_note` only creates new files under `Inbox/` in the vault. It never changes an existing note.

## 2. Configure the agent

The examples use `http://127.0.0.1:3000/mcp`.
- **From another machine** (LAN or Tailscale):
  - start the server with `CAVE_HOST` and `CAVE_TOKEN` (see AGENTS.md);
  - add the name agents use to reach it to `CAVE_ALLOWED_HOSTS`, for example `CAVE_ALLOWED_HOSTS=laptop.tail1234.ts.net`.
- **Why the Host check:** `/mcp` refuses any `Host` it doesn't know, as protection against DNS rebinding.

### Claude Code

The project-scoped way: a `.mcp.json` entry. Claude Code expands `${VAR}` in `headers`, so the token stays in the environment:

```json
{
  "mcpServers": {
    "cave": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": { "Authorization": "Bearer ${CAVE_AGENT_TOKEN}" }
    }
  }
}
```

Or add it from the command line. Here the shell expands the variable, so the token is stored in Claude Code's own config (`~/.claude.json` for `--scope user`). It does not go into the repo:

```bash
claude mcp add --transport http --scope user cave http://127.0.0.1:3000/mcp --header "Authorization: Bearer $CAVE_AGENT_TOKEN"
```

Checked against `claude mcp add --help` (Claude Code 2.1.296) and a headless run with `--mcp-config` (`docs/log/m3.md`).

### Codex

In `~/.codex/config.toml`. Codex reads the bearer token from the named variable:

```toml
[mcp_servers.cave]
url = "http://127.0.0.1:3000/mcp"
bearer_token_env_var = "CAVE_AGENT_TOKEN"
```

Checked against Codex's `McpServerTransportConfig::StreamableHttp` (`url`, `bearer_token_env_var`).

### OpenCode

In `opencode.json`. `oauth: false` stops OpenCode from trying OAuth discovery against a server that uses a static token:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "cave": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/mcp",
      "oauth": false,
      "headers": { "Authorization": "Bearer {env:CAVE_AGENT_TOKEN}" }
    }
  }
}
```

Checked against opencode.ai/docs/mcp-servers (remote servers, `headers`, `{env:…}`, `oauth: false`).

## Claude in the desktop and mobile apps

Claude's apps reach custom connectors from Anthropic's cloud, not from your machine. That needs a public HTTPS URL with OAuth, which the Cave doesn't offer yet. It comes with the VPS milestone. Until then, use Claude Code, Codex or OpenCode on a machine that can reach the server.
