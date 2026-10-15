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
- **Reminders:** a reminder whose `repeat` isn't `none` repeats on completion. `update` with `done: true` moves `due` to the next occurrence and keeps it open, as the app's Done does. Notifications arrive with M7 Part B; until then a due reminder shows on Home. Agents must not offer outside scheduled tasks for Cave reminders.
- **Notes:** `add_note` only creates new files under `Inbox/` in the vault. It never changes an existing note.

## 2. Configure the agent

The examples use `http://127.0.0.1:3000/mcp`, an agent on the same machine as the server.

### The hosted server

Once the Cave runs at `https://cave.alexjamesmx.dev` (see `docs/hosting.md`), agents anywhere reach it over HTTPS. Mint the token on the VPS **in hPanel's browser terminal**, not over an SSH session from an agent's machine: the token is printed once, and it must not end up in an agent's own output or context.

```bash
sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave/current && /opt/bun/bin/bun run agent add claude-code --scopes read,write'
```

Put the token in `CAVE_AGENT_TOKEN` on the agent's machine, then add this `.mcp.json` entry:

```json
{
  "mcpServers": {
    "cave": {
      "type": "http",
      "url": "https://cave.alexjamesmx.dev/mcp",
      "headers": { "Authorization": "Bearer ${CAVE_AGENT_TOKEN}" }
    }
  }
}
```

Codex and OpenCode take the same URL in place of `http://127.0.0.1:3000/mcp` in the examples below.

### From another machine without the hosted server: Tailscale only

The server speaks plain HTTP, so on an ordinary LAN the agent token, and everything the agent reads, crosses the network unencrypted. Anyone on that Wi-Fi could copy the token. Tailscale encrypts traffic between your devices, so use it for any agent not on the server's machine:

1. Start the server on the Tailscale address with an owner token: `CAVE_HOST=<tailscale IP>` and `CAVE_TOKEN=<long random value>` (see AGENTS.md).
2. Add the name agents use to reach it: `CAVE_ALLOWED_HOSTS=laptop.tail1234.ts.net`.
3. Point the agent at `http://laptop.tail1234.ts.net:3000/mcp`.

Don't expose the server on a plain LAN or to the internet. `/api` and `/mcp` refuse any `Host` they don't know (protection against DNS rebinding) and any foreign `Origin`.

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

## Claude apps (desktop and phone)

Claude's apps reach custom connectors from Anthropic's cloud, so they use the hosted server, `https://cave.alexjamesmx.dev/mcp`. No OAuth: the connector sends the agent token in a request header. Verified from Cowork and the phone on 2026-10-14.

1. **Mint the token in hPanel's browser terminal**, never over an SSH session an agent can read:
   ```bash
   sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave/current && /opt/bun/bin/bun run agent add claude-apps --scopes read,write'
   ```
   Keep the printed token in your password manager.
2. **Add a custom connector** in Claude's connector settings:
   - URL: `https://cave.alexjamesmx.dev/mcp`;
   - sign-in: **No sign-in**;
   - request header: name `authorization`, value `Bearer <token>`, **Required**.
3. **Set the write tools to ask first:** `create`, `update`, `propose_delete` and `add_note`. Read tools can stay allowed.

- The connector belongs to the Claude account, so every device signed in to it has the Cave.
- **Changing the token** (lost, leaked, rotated) means revoking `claude-apps`, minting a new one, then removing and re-adding the connector: the header value can't be edited in place.
- Request-header authentication is a beta for a limited set of organizations. If Anthropic removes it, OAuth on `/mcp` comes back as a milestone (`docs/decisions.md`).
