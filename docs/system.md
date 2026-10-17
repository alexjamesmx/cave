# How the Cave works

One page for the whole system: what runs where, how data and code move, how to work on it locally without touching production, and how to rebuild any piece from scratch. Details live in the files linked from each section.

## 1. The pieces

```mermaid
flowchart LR
  subgraph Devices["Your devices (each holds a full offline copy)"]
    L["Laptop browser<br/>installed PWA"]
    P["Phone browser<br/>installed PWA"]
  end
  subgraph Agents["Agents"]
    CC["Claude Code<br/>(laptop, in the repo)"]
    CA["Claude apps<br/>(desktop, phone: connector)"]
  end
  subgraph VPS["VPS · Ubuntu · cave.alexjamesmx.dev"]
    C["Caddy :443<br/>HTTPS, certificate, headers"]
    S["Cave server (Bun)<br/>127.0.0.1:3000, user cave"]
    DB[("SQLite<br/>/var/lib/cave/cave.db")]
    B[("Backups<br/>/var/lib/cave/backups")]
  end
  GH["GitHub<br/>alexjamesmx/cave (private)"]

  L -- "HTTPS + server token<br/>/api/sync" --> C
  P -- "HTTPS + server token<br/>/api/sync" --> C
  CC -- "HTTPS + agent token<br/>/mcp" --> C
  CA -- "HTTPS + agent token<br/>/mcp" --> C
  C --> S
  S --> DB
  S -- "daily, verified" --> B
  GH -- "deploy key, read-only" --> VPS
```

| Piece | Where | Job |
|---|---|---|
| PWA | each device's browser | the app; keeps a full copy in IndexedDB and works offline |
| Caddy | VPS, ports 80 and 443 | HTTPS with automatic Let's Encrypt certificates, security headers, forwarding to the server |
| Cave server | VPS, `127.0.0.1:3000` | sync hub, MCP server for agents, backups; never reachable directly from outside |
| SQLite | VPS, `/var/lib/cave` | the one server-side copy of every record |
| GitHub | cloud | the code; the VPS can only read it, and deploys the tip of `main` |
| Claude Code cloud sessions | Anthropic VM | change the code from the phone or browser; push branches and open PRs, never merge; no production access |
| Laptop repo | `C:\Users\sgale\projects\jarvis` | where code is written and tested; `bun run deploy` deploys now |

**Who gets in.** Every `/api` request needs the server token, and `/mcp` needs an agent token. Before any token check, the request guard refuses unknown hosts, foreign origins and non-JSON posts. The firewall lets in only 22, 80 and 443, and SSH takes keys only.

## 2. How a record moves (sync)

```mermaid
sequenceDiagram
  participant U as You (phone, offline)
  participant IDB as Phone IndexedDB
  participant S as Cave server
  participant DB as SQLite
  participant L as Laptop
  U->>IDB: add expense (stamped with a hybrid clock)
  IDB->>IDB: store the doc and queue it in the outbox
  Note over U,IDB: works with no connection
  IDB->>S: POST /api/sync (token, outbox, cursor) when back online
  S->>S: guard, token, validate, merge per field (newest stamp wins)
  S->>DB: store and log the change (for undo and history)
  S-->>IDB: changes since your cursor
  L->>S: POST /api/sync (its own cursor)
  S-->>L: the new expense
```

- **Every field merges on its own.** Edits to different fields of one record never overwrite each other. For the same field, the newer stamp wins.
- **Nothing is hard-deleted.** Deleting sets `_deleted`. Every change keeps its previous value, which is what undo uses.
- **Spec:** `docs/plan-v0.1.md`, "Sync protocol".

## 3. How code moves (develop, review, deploy)

```mermaid
flowchart TD
  A["Claude Code: a cloud session (phone or browser)<br/>or the laptop repo"] --> C["bun run check · bun test<br/>(bun run e2e on the laptop)"]
  C --> D["Push a branch, open a PR"]
  D --> E{"CI green<br/>and the owner agrees?"}
  E -- no --> A
  E -- yes --> F["The owner merges to main<br/>(GitHub app or web)"]
  F --> G["VPS: cave-deploy.timer, every 2 min,<br/>sees a new tip of main"]
  G --> H["As user cave: new release dir,<br/>install, check, test"]
  H --> I{"passed?"}
  I -- no --> J["Running release untouched;<br/>commit held, failed step in Settings"]
  I -- yes --> K["Switch current, restart,<br/>loopback health check"]
  K --> L{"healthy?"}
  L -- no --> M["Automatic rollback;<br/>commit held"]
  L -- yes --> N["Live; Settings shows the commit"]
```

- **Merging to `main` deploys.** Nothing on GitHub can stop a merge on a private repo with GitHub Free, so the gates are the owner's merge, the VPS re-running `check` and `test`, and the health check with automatic rollback.
- **One deploy path.** `/usr/local/sbin/cave-deploy` (root, installed by hand from `deploy/cave-deploy`) is the only thing that deploys. The timer runs `cave-deploy auto`; `bun run deploy` runs `cave-deploy now` over SSH, then checks the public URL.
- **A backup before every switch.** Each deploy first takes a verified backup with the running release's code, in `/var/lib/cave/backups/pre-deploy` (newest five kept). A rollback across a migration needs it: the older release refuses the newer schema (`docs/hosting.md`).
- **A held commit** (failed or rolled back) is skipped by the timer until `cave-deploy now` retries it or a newer commit lands on `main`.
- Each release lives in `/opt/cave/releases/<commit>`, and `current` points at the running one. Five are kept. The last result is in `/var/lib/cave-deploy/status.json`.
- **Details:** `deploy/cave-deploy`, `deploy/release.sh`, `docs/hosting.md`.

## 3b. How a reminder reaches the phone

```mermaid
sequenceDiagram
  participant S as Cave server (job scheduler, every 30 s)
  participant N as Notifier
  participant P as Push service (Apple, Google, Mozilla)
  participant T as Telegram / Discord
  participant D as Phone (Home Screen app)
  S->>S: reminder due, key reminder:id:due not sent yet
  S->>N: notify(title, due time, Done / Snooze 1h)
  N->>P: Web Push, encrypted (aes128gcm) and signed (VAPID), full detail
  N->>T: titles only, unless the owner chose full
  P->>D: notification shown (Declarative Web Push, or the service worker)
  D->>D: tap opens /r/:id?do=done in the app: a stamped write, then sync
```

- **One job loop** runs the reminder sweep, scheduled flows, Telegram's long poll and the hourly backup check (`server/jobs/`).
- **Flows** (`server/flows/`): scheduled ones run from that loop; item triggers run after the write that caused them commits (`Store.onApplied`). Each slot or change runs once (`flow_runs`), writes as `flow:<id>`, and never triggers another flow. Agents save flows through `save_flow`; one that changes existing items waits as `pending-approval`.
- **`/system`** shows all of it: jobs and their runs, schedules for 7 days, flows, agents, devices, integrations and the notification log. `GET /api/system` (`server/system/report.ts`) answers with what only the server knows, by id, channel and key, never a secret; the rest comes from the device's copy.
- **Channels sit behind one interface** (`server/notify/types.ts`): Web Push is the private default; Telegram is two-way for one linked chat; Discord is one-way. Each says what it needs ("needs keys", "needs linking", "webhook gone").
- **Nothing is sent twice:** `notifications_sent` keeps every key; a snooze or the next repeat is a new key. A reminder more than 6 hours late after downtime is recorded as missed, not sent.
- **No token in the service worker:** a notification's buttons open the app, which does the write.

## 4. How backups move

```mermaid
flowchart LR
  S["Cave server"] -- "at start-up and every 24 h<br/>VACUUM INTO, verified" --> VB[("VPS backups<br/>newest 14 + one per month")]
  VB -- "bun run pull-backups<br/>(scp, verify, keep)" --> LB[("Laptop<br/>data/vps-backups")]
  LB -- "bun run restore" --> DEV[("Local dev copy<br/>data/dev.db")]
  VB -- "bun run restore (on the VPS)" --> S
  VB -- "cave-offsite backup, daily<br/>restic, encrypted" --> R2[("Cloudflare R2<br/>30 daily + 24 monthly snapshots")]
  R2 -- "cave-offsite check, weekly<br/>restore and verify" --> VB
```

**Three copies.** The VPS's own backups, the encrypted copy in R2 (`/usr/local/sbin/cave-offsite`, from `deploy/cave-offsite`; `docs/hosting.md` step 14), and the laptop's pulled backups. `/system` and Settings show the last off-box backup and check, and the Cave notifies once when the copy is over 48 hours old or a check failed.

**Restore recovers a broken server; it doesn't undo edits.** After a restore, devices push back anything newer than the backup. To reverse a change, use undo on the Agents page or the item's history.

## 5. Working locally (no deploys while testing)

The local server and production never share data:
- the local app runs at `http://127.0.0.1:3000`, a different origin, so its IndexedDB is separate;
- the local database is a separate file;
- it runs as `CAVE_ENV=dev` unless told otherwise, so a copy of real data sends no push, Telegram or Discord message: sends go to the Dev outbox in `/system`, and a `DEV` badge shows. Only the VPS sets `CAVE_ENV=production`.

**Fake data instead** (and the only data a cloud session ever has): `bun run dev:seed` seeds `data/seed.db` and serves it, with the token `seed`.

**One-time setup on the laptop.** Add to `.env`:
```
CAVE_DB_PATH=data/dev.db
```

**Fresh dev copy of real data** (whenever you want one):
```powershell
bun run pull-backups                                  # newest verified VPS backups into data/vps-backups
bun run restore data/vps-backups/<newest>.db          # into data/dev.db (stop the local server first)
```

**Daily loop:**
```powershell
git switch -c <branch>
bun run dev                                           # http://127.0.0.1:3000, no token needed on loopback
bun run check; bun test; bun run e2e                  # e2e uses its own temp database
```

**Agents against the local server.** `.mcp.json` points `cave` at production. To try MCP changes locally, add a second entry `cave-dev` with URL `http://127.0.0.1:3000/mcp` and the same `${CAVE_AGENT_TOKEN}`. A restored dev copy contains the production agent tokens' hashes, so the same token works locally, but only if the backup is newer than the token. After minting a new agent token, take a fresh backup on the VPS first (`bun run backup` as `cave`, as in `docs/hosting.md`), then pull and restore.

**Rules:**
- Never point a local server at the VPS database, and never copy `data/dev.db` up to the VPS.
- Production changes go through PR, merge and `bun run deploy`.
- `data/` is git-ignored and Claude Code is denied access to it. Copies of real data stay on the laptop.

## 6. Recreate from scratch

### A new development laptop
1. **Tools:**
   - **Windows:** `setup/setup.cmd`. It installs Git, Bun, the GitHub CLI and Claude Code, and asks for the MCP keys.
   - **Linux or macOS:** install git, `gh`, Bun 1.4.3 (`curl -fsSL https://bun.com/install | bash -s bun-v1.4.3`) and Claude Code by hand.
2. **Code:**
   ```bash
   gh auth login
   gh repo clone alexjamesmx/cave
   cd cave
   git config core.hooksPath .githooks
   bun install && bun run check && bun test
   ```
3. **SSH to the VPS:**
   - Run `ssh-keygen -t ed25519` (with a passphrase).
   - In hPanel's browser terminal, append the new public key to `/root/.ssh/authorized_keys`.
   - Add to `~/.ssh/config`:
     ```
     Host cave-vps
       HostName 203.0.113.10
       User root
       IdentityFile ~/.ssh/id_ed25519
     ```
   - Run `ssh cave-vps true`. Check that the host key fingerprint matches `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` in the browser terminal.
4. **`.env`:** copy it from `.env.example`. Set:
   - `CAVE_DB_PATH=data/dev.db`;
   - `CAVE_REMOTE_URL=https://cave.alexjamesmx.dev`;
   - `CAVE_REMOTE_TOKEN` (the server token, from your password manager);
   - `BACKUP_PULL_DIR=data/vps-backups`;
   - `VAULT_PATH` if the vault is on this machine.
5. **Agent token:** one per machine.
   - In the browser terminal, run `bun run agent add claude-code-<machine> --scopes read,write` (the full command is in `docs/agents.md`).
   - Store the token as the user environment variable `CAVE_AGENT_TOKEN`, without putting it on a command line.
   - Revoke the old machine's token with `bun run agent revoke <name>`.
6. **Claude Code:** start `claude` in the repo, check `/mcp` shows `cave` connected, then make the dev copy (section 5).

### A new phone, tablet or browser
1. **The app:** open `https://cave.alexjamesmx.dev`, unlock it with the server token, and install the app. The first sync downloads everything.
2. **Claude:** sign in to the Claude app. The Cave connector is part of the account, so it is already there; if not, add it as `docs/agents.md` "Claude apps" says.
3. **Code:** the Code tab of the Claude app starts cloud sessions on `alexjamesmx/cave` in the `cave` environment. Nothing to install on the phone.

### A lost device
1. Replace the server token on the VPS:
   - edit `CAVE_TOKEN` in `/etc/cave/cave.env`, using the `printf` method from `docs/hosting.md` step 4;
   - run `systemctl restart cave`.
2. Enter the new token on your remaining devices.
3. Update `CAVE_REMOTE_TOKEN` in the laptop's `.env`.
4. If the device had an agent token, revoke it as well.

### A new VPS
1. Create the VPS with plain Ubuntu (no panel template) and your SSH key.
2. Point the `cave` A and AAAA records at it.
3. Run `docs/hosting.md` from step 0, including step 11: the `cave-deploy` wrapper, its state directory and units.
4. In step 9, restore the newest backup from `data/vps-backups` instead of the laptop database.
5. Generate a new server token, and new agent tokens if the old database is gone.

### The DNS records (hPanel, zone `alexjamesmx.dev`)
| Type | Name | Value |
|---|---|---|
| A | `cave` | VPS IPv4 (`203.0.113.10`) |
| AAAA | `cave` | VPS IPv6 (`2001:db8::10`) |

Don't touch the other records (portfolio, mail).

## 7. Secrets: where each lives

| Secret | Lives in | Never in |
|---|---|---|
| Server token `CAVE_TOKEN` | `/etc/cave/cave.env` (root:cave 640), your password manager, each unlocked device (localStorage), the laptop `.env` as `CAVE_REMOTE_TOKEN` | git, logs, chats, command lines |
| Agent tokens | shown once at creation; the agent's environment variable (`CAVE_AGENT_TOKEN`); only their SHA-256 on the server | git, `.mcp.json` (it uses `${CAVE_AGENT_TOKEN}`) |
| The `claude-apps` agent token | the Claude account's Cave connector (request header); your password manager | git, cloud environments, chats |
| The GitHub account | your password manager, with two-factor login | anywhere else: whoever can merge to `main` ships code that runs with all the data |
| SSH keys | `~/.ssh` on the laptop; the VPS deploy key in `/var/lib/cave/.ssh` | anywhere else |
| MCP keys (Context7, Exa, Firecrawl, GitHub) | user environment variables | git |
| Web Push private key `CAVE_VAPID_PRIVATE` | `/etc/cave/cave.env` only (`bun run push-keys` appends it) | logs, API answers, the client, docs |
| Telegram bot token `CAVE_TELEGRAM_BOT_TOKEN` | `/etc/cave/cave.env`; @BotFather can reissue it | logs, API answers, the client |
| Discord webhook `CAVE_DISCORD_WEBHOOK_URL` | `/etc/cave/cave.env`: anyone holding it can post | logs, API answers, the client |

## 8. Where to look next
- `docs/plan-v0.1.md`: data model, sync protocol, milestones.
- `docs/hosting.md`: the server runbook.
- `docs/agents.md`: connecting Claude Code, Codex and OpenCode.
- `docs/decisions.md`: why things are the way they are.
- `docs/log/` and `docs/review/`: what was built and checked, milestone by milestone.
