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
  - `read`: `list_collections`, `query`, `get`, `money_month`, `get_project`, `list_flows`.
  - `write`: `create`, `update`, `propose_delete`, `mark_paid`, `save_flow`, `start_run`, `log_step`, `finish_run`, and `add_note`.
- `--collections` limits what the agent can see. Other collections don't appear in its lists, and anything in them answers "not found".
- Keep the token in an environment variable, `CAVE_AGENT_TOKEN` below. Never put it in a committed file.

## Rules every agent gets

- **Amounts, categories and accounts:** never guess them. A value that isn't one of a field's options is refused; ask the owner or leave the field out.
- **Deletes:** agents can't delete. `propose_delete` puts a proposal on the Agents page, and the owner approves or declines it.
- **Undo:** every agent write can be undone from the Agents page. A key the owner changed afterwards is kept.
- **Reminders:** a reminder whose `repeat` isn't `none` repeats on completion. `update` with `done: true` moves `due` to the next occurrence and keeps it open, as the app's Done does. The Cave sends a due reminder's notification itself, so agents must not offer outside scheduled tasks for Cave reminders.
- **Repeating tasks:** a task with `repeat` other than `none` comes back: `update` with `status: "done"` moves `due` to the next date, keeps it open (`todo`) and sets `completed`, as the app's Done does. The change log keeps every completion.
- **Payments:** the `payments` collection holds what the owner pays on a date (subscriptions, cards, bills, loans). `mark_paid` logs the expense (title, category and account from the payment) and moves the payment to its next date; a one-off one becomes inactive. A payment with `approx: true` (a card statement) needs `amount`: ask the owner, never guess it.
- **Money categories:** each option has a `kind` (`expense`, `income`, `transfer`); use one that fits the direction. Transfers count as neither spending nor income.
- **The `ai` collection:** the owner's AI rules, skills, MCP servers, plugins and memory, from `bun run ai-sync`, with secrets replaced by `‹redacted›`. Agents may read them and improve them with `update` (the `_body`); the owner's `ai-sync --apply` writes an edit back to its file after confirming it, and never writes a body that holds `‹redacted›`. Never put a secret in an item.
- **Projects:** items point at a project (an item in `projects`) through a `ref` field, `project`, holding its id; tasks also have `part` (an item in `parts`). A ref must name a live item of its collection, or the write is refused. `get_project` returns the project, its parts as a tree, its open tasks and per collection the count and latest 20 linked items; `query` with `where: { project: "<id>" }` lists more.
- **A project's map:** `update` its `map` field with the whole value: `{ version: 1, positions: { <item id>: { x, y } }, notes: [{ id, text, x, y }], groups: [{ id, title, x, y, w, h }], edges: [{ id, from, to }] }`. Note, group and edge ids are short (`n1`, `g1`, `e1`). Text is plain text; anything that looks like HTML is refused. An edge must join two nodes the map places, and limits are 500 nodes, 500 edges and 200 KB. Read the current value first and change only what you mean to, since the whole value is replaced.
- **Runs (showing your work):** on a project the owner asked you to work on, call `start_run(project, title, part?)` and keep the returned id. Then call `log_step(run, title, status, detail?)` per meaningful action (status running, done, failed, waiting or skipped), and end with `finish_run(run, done | failed | cancelled, summary)`. The owner watches it live in the project's Activity tab, in AI → Activity, and on the project's Map while it runs. You can only touch runs you started; `create` and `update` can't reach the `runs` collection. A run holds at most 200 steps, and titles and details are plain text (anything that looks like HTML is refused).
- **Flows:** only through `save_flow` and `list_flows`. `create` and `update` can't reach the `flows` collection. See "Flows" below.
- **Notes:** `add_note(title, body)` creates a note in the Cave's Notes, in the Inbox folder, marked as written by an agent. It never changes an existing note. Link another note with `[[Title]]` or `[[Title|label]]`. Bodies are Markdown, shown with no raw HTML and no remote images. Other agents read notes with `query` on `notes`.
- **Radar:** findings for the owner go through `create` on `radar`: the title, the summary as `body`, and fields `url` (http or https, required), `why` (one line on why it matters to the owner, required), `source` (your own label, for example "Hacker News" or "arXiv") and `interests` (comma-separated names from `settings.radarInterests`). Search with `query` first: one item per address, and a duplicate is refused with the id already there (case, `www.`-less host, a trailing slash and a `#fragment` don't make a new address). At most 50 new findings per agent per day. `status` starts `new` and `found_at` is set for you; the owner saves or dismisses. Titles and summaries are shown as untrusted text.

## Flows

A flow is a trigger and up to 10 steps, stored as one definition (`version: 1`). Triggers: `schedule` (every day, week, month or year at a time), `item-added` (with optional conditions) and `item-changed` (a field, optionally to a value). Steps: `if` (all conditions hold, else stop), `create`, `update-trigger-item` and `notify`. Text may use `{{item.title}}`, `{{item.<field>}}`, `{{item.<field>|pct:N}}`, `{{today}}` and `{{month}}`, nothing else.

**A reminder or a flow?** A reminder only notifies. Use a flow when something must also be created or changed. "Remind me every month to pay rent on the 22nd" as a reminder:

```json
{ "tool": "create", "collection": "reminders", "title": "Pay rent",
  "fields": { "due": "2026-10-22T09:00", "repeat": "monthly" } }
```

As a flow, which also puts a task on the list:

```json
{ "tool": "save_flow", "title": "Rent reminder", "status": "on",
  "definition": { "version": 1,
    "trigger": { "type": "schedule", "every": "month", "day": 22, "at": "09:00" },
    "steps": [
      { "type": "create", "collection": "tasks", "title": "Pay rent", "fields": { "priority": "high" } },
      { "type": "notify", "title": "Pay rent", "open": "created-item" } ] } }
```

**What needs the owner's approval, and why:**
- A flow with a step that changes existing items (`update-trigger-item`, and every future step that reaches outside the Cave) is saved as `pending-approval`, whatever status was asked for. It runs only after the owner approves it on the Flows page, the Agents page or, if the owner turned it on, Telegram. A flow that only creates items and notifies can be saved `on` and runs at once.
- An agent can never approve: re-saving a waiting flow as `on` keeps it waiting.
- A flow may name only collections and fields the agent can see; one that names others is refused, and an allowlisted agent neither lists nor replaces flows outside its collections.
- Limits per agent: 20 flows `on` and 10 saves a day.
- Every save is in the activity log and can be undone. A flow's own writes are recorded as `flow:<id>`, can be undone from its run history, and never trigger another flow.

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

The local server speaks plain HTTP and answers on loopback only; any other machine uses the hosted server over HTTPS. `/api` and `/mcp` refuse any `Host` they don't know (protection against DNS rebinding) and any foreign `Origin`.

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
3. **Set the write tools to ask first:** `create`, `update`, `propose_delete`, `mark_paid`, `save_flow` and `add_note`. Read tools can stay allowed.

- The connector belongs to the Claude account, so every device signed in to it has the Cave.
- **Changing the token** (lost, leaked, rotated) means revoking `claude-apps`, minting a new one, then removing and re-adding the connector: the header value can't be edited in place.
- Request-header authentication is a beta for a limited set of organizations. If Anthropic removes it, OAuth on `/mcp` comes back as a milestone (`docs/decisions.md`).
