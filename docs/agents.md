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
  - `read`: `list_collections`, `query`, `get`, `money_month` (a month's totals, and the owner's `budget`: `limit`, `spent`, `left`, `pace`, `savingTarget`, `saved`, or `null` until the owner sets a limit; agents never set the budget), `list_flows`, `get_routine` (the weekly routine's blocks and the diary's habits; the blocks only for an agent that sees every collection).
  - `write`: `create`, `update`, `propose_delete`, `mark_paid`, `save_flow`, `set_routine` (replaces the whole week, checked like the app; only for an agent that sees every collection), `add_habit` (a diary checkbox; an archived one comes back) and `add_note`.
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
- **LeetCode:** since M15 it is one note, `note-leetcode` ("LeetCode", topic `LeetCode`): a `## ` heading per group and a line per problem, `- [ ] <number> · <name> · <difficulty>` (`- [x] ` once solved), any other detail after ` · `. Read it with `get`, change it with `update` on its `body` (Markdown); keep the line format so the owner's checkboxes and the card's count stay right. The `leetcode` collection is retired (seed migration 27); `create`, `query` and flows that name it answer "not found".
- **Asking the owner:** never guess an amount, a category or an account. When a decision is the owner's, create a task for them with the question in its title.
- **Flows:** only through `save_flow` and `list_flows`. `create` and `update` can't reach the `flows` collection. See "Flows" below.
- **Pages:** `add_note(title, body)` creates a Markdown note marked as written by you, in the Notes section under the topic Inbox. It never changes an existing note. Write a note when the owner should read something long (a plan, resources, a report), and a task when they should do something. Link another note with `[[Title]]` or `[[Title|label]]`. Bodies are Markdown, shown with no raw HTML and no remote images. `- [ ] ` / `- [x] ` lines are the note's own checkboxes, ticked in the app; they are not tasks. Other agents read notes with `query` on `notes`.
- **Ideas:** since M14 an idea is a note in topic `Ideas`: `create` on `notes` with `fields: { "folder": "Ideas" }` (`add_note` files under Inbox). Seed migration 26 moved every idea there, its stage, area and next step as lines in the body. The `ideas` collection is retired, so `create`, `query` and flows that name it answer "not found". A flow about new ideas triggers on `item-added` in `notes` with the condition `folder = Ideas`; a stored flow that still names `ideas` is not rewritten, so it never fires (or its step fails in Runs) until it is edited.
- **Radar:** off since M12. The `radar` collection still exists under Settings → Data and `create` on it still follows its rules (an http or https `url`, a `why`, one item per address, 50 a day), but nothing shows it; something the owner should read goes in a note, and something they should do or decide in a task.

## Flows

A flow is a trigger and up to 10 steps, stored as one definition (`version: 1`). Triggers: `schedule` (every day, week, month or year at a time), `item-added` (with optional conditions), `item-changed` (a field, optionally to a value) `date-arrives` (a date `field` of a `collection`, optional `before` days and conditions; a repeating date arrives on each date of its series, once per date; items with `active` false or `done` true are skipped) and `budget-reached` (`percent` of the monthly limit, once a month; needs access to money). Steps: `if` (all conditions hold, else stop), `create`, `update-trigger-item`, `notify` (with `open: "trigger-item"` it is about that item: a reminder carries Done and Snooze), `email` (`subject`, `body` up to 4,000 characters, optional `to`: up to 5 addresses separated by commas, else the owner; optional `fromName`) and `digest` (the daily digest by email; only an agent that can read every collection may use it). Text may use `{{item.title}}`, `{{item.<field>}}`, `{{item.<field>|pct:N}}`, `{{today}}` and `{{month}}`, nothing else.

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
- A flow with a step that changes existing items or reaches outside the Cave (`update-trigger-item`, `email`) is saved as `pending-approval`, whatever status was asked for. It runs only after the owner approves it on the Flows page, the Agents page or, if the owner turned it on, Telegram. A flow that only creates items and notifies can be saved `on` and runs at once.
- An agent can never approve: re-saving a waiting flow as `on` keeps it waiting.
- A flow may name only collections and fields the agent can see; one that names others is refused, and an allowlisted agent neither lists nor replaces flows outside its collections.
- Limit per agent: 20 flows `on`.
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

Checked against `claude mcp add --help` (Claude Code 2.1.296).

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
3. **Set the write tools to ask first:** `create`, `update`, `propose_delete`, `mark_paid`, `save_flow`, `set_routine`, `add_habit` and `add_note`. Read tools can stay allowed.

- The connector belongs to the Claude account, so every device signed in to it has the Cave.
- **Changing the token** (lost, leaked, rotated) means revoking `claude-apps`, minting a new one, then removing and re-adding the connector: the header value can't be edited in place.
- Request-header authentication is a beta for a limited set of organizations. If Anthropic removes it, OAuth on `/mcp` comes back as a milestone (`docs/decisions.md`).
