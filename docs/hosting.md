# Hosting runbook (first-time server setup)

The one-time setup of the VPS, run step by step. Each step is shown to the owner and run only with their approval. Its real output goes into the milestone log, with secrets redacted.

- **Target:**
  - Hostinger KVM 2, Ubuntu 26.04 LTS;
  - reached as `ssh cave-vps` (root, key only) from the laptop;
  - served at `cave.alexjamesmx.dev`, whose A and AAAA records point at the VPS.
- **Layout on the VPS:**

  | Path | What |
  |---|---|
  | `/opt/cave/repo.git` | bare clone, fetched with the deploy key |
  | `/opt/cave/releases/<sha>` | one checkout per deployed commit (a git worktree), with its own `node_modules` |
  | `/opt/cave/current` | symlink to the release the service runs; switched atomically, only after the release passed install, check and test |
  | `/opt/cave/previous` | symlink to the release before it; target of `cave-deploy rollback` |
| `/usr/local/sbin/cave-deploy` | the deploy wrapper, root-owned, installed by hand from `deploy/cave-deploy` (step 11); never updated by a deploy |
| `/var/lib/cave-deploy` | the wrapper's state, root-owned and world-readable: `status.json` (last result) and `held` (a commit the timer skips) |
  | `/var/lib/cave` | data only: database, backups, lock. Home of `cave` |
  | `/var/cache/cave-bun` | build caches: Bun's install and transpiler caches, Biome's cache (`XDG_CACHE_HOME`). The service itself writes no cache |
  | `/opt/bun` | Bun itself, root-owned |
  | `/etc/cave/cave.env` | server settings and token |
- **Templates:** in `deploy/`. Steps that copy them read them from `/opt/cave/current/deploy/`.

**Rules:**
- **Secrets.** Tokens are generated on the VPS and never printed into a shared terminal, Claude Code's session or a log. They never go on a command line either, where any user could see them in `ps`. Commands that need the settings read `/etc/cave/cave.env` inside the shell. The owner reads each token once in **hPanel's browser terminal** and keeps it in a password manager.
- **Privileges.** `cave` has **no sudo rights**. It builds releases; `cave-deploy`, running as root, restarts the service. Code merged to `main` never runs as root: the wrapper only runs each commit's `release.sh` as `cave`.

## 0. Prerequisites
- **The M5 code is on `origin/main`.** `deploy/release.sh` builds only commits on `origin/main`, and the server needs `CAVE_PUBLIC_ORIGIN` support to run behind Caddy.
- **The laptop key has a passphrase.** `~/.ssh/id_ed25519` opens root on the VPS. If it has none, add one and let the Windows `ssh-agent` hold it, so deploys don't prompt each time. In an admin PowerShell:

  ```powershell
  ssh-keygen -p -f $HOME\.ssh\id_ed25519
  Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent
  ssh-add $HOME\.ssh\id_ed25519
  ```
- **The root password was changed** (`passwd` in the browser terminal) after it appeared in a chat.

## 1. User and directories
`cave` is a system user with no login shell. Its home is its data directory.

```bash
useradd --system --home-dir /var/lib/cave --shell /usr/sbin/nologin cave
install -d -o cave -g cave -m 700 /var/lib/cave
install -d -o cave -g cave -m 755 /opt/cave
install -d -o cave -g cave -m 700 /var/cache/cave-bun
```

## 2. Bun, pinned
Install the version the repo and CI use, into `/opt/bun`: root-owned and readable by the service. The installer needs `unzip`. Download the script first and read it before running it.

```bash
apt-get update && apt-get install -y unzip
curl -fsSL https://bun.com/install -o /root/bun-install.sh
BUN_INSTALL=/opt/bun bash /root/bun-install.sh bun-v1.4.3
/opt/bun/bin/bun --version        # expect 1.4.3
```

## 3. Deploy key, bare clone, first release
The VPS reads the private repo with a **read-only** deploy key. The key is created on the VPS, and only its public half leaves it.

```bash
install -d -o cave -g cave -m 700 /var/lib/cave/.ssh
sudo -u cave ssh-keygen -t ed25519 -N "" -C "cave-vps-deploy" -f /var/lib/cave/.ssh/id_ed25519
```

On the laptop, add the public half to the repo as read-only (the default):

```bash
ssh cave-vps cat /var/lib/cave/.ssh/id_ed25519.pub > cave-vps-deploy.pub
gh repo deploy-key add cave-vps-deploy.pub --repo alexjamesmx/cave --title cave-vps
rm cave-vps-deploy.pub
```

Pin GitHub's host key, checking it against GitHub's published fingerprint (`gh api meta`). ED25519 is `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`.

```bash
ssh-keyscan -t ed25519 github.com | sudo -u cave tee /var/lib/cave/.ssh/known_hosts
ssh-keygen -lf /var/lib/cave/.ssh/known_hosts
sudo -u cave git clone --bare git@github.com:alexjamesmx/cave.git /opt/cave/repo.git
```

Build the first release from the laptop. It runs install, check and test in `/opt/cave/releases/<sha>` and then creates `current`:

```bash
git fetch origin
ssh cave-vps sudo -u cave -H bash -s -- build "$(git rev-parse origin/main)" < deploy/release.sh
ssh cave-vps readlink /opt/cave/current
```

## 4. Server settings and token
`/etc/cave/cave.env` belongs to root, with group `cave` and mode 640. The token is written straight into the file and is never echoed.

```bash
install -d -o root -g cave -m 750 /etc/cave
install -o root -g cave -m 640 /opt/cave/current/deploy/cave.env.example /etc/cave/cave.env
sed -i '/^CAVE_TOKEN=$/d' /etc/cave/cave.env
# printf is a shell builtin, so the token never appears in any process's arguments.
printf 'CAVE_TOKEN=%s\n' "$(openssl rand -base64 48)" >> /etc/cave/cave.env
grep -c '^CAVE_TOKEN=.\{64\}$' /etc/cave/cave.env    # expect 1, without showing the value
```

The owner then reads it once in hPanel's browser terminal (`grep ^CAVE_TOKEN= /etc/cave/cave.env`) and stores it in a password manager. It is also the laptop's `CAVE_REMOTE_TOKEN`, used for the public health check after `bun run deploy`.

## 5. Caddy
Install from Caddy's official repository; its `any-version` source works on Ubuntu 26.04. First confirm 80 and 443 are still free (`ss -tlnp`).

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
install -m 644 /opt/cave/current/deploy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

## 6. Firewall
Allow SSH first, then 80 and 443 (443 over UDP too, for HTTP/3), and deny everything else inbound. Port 3000 is never opened; the server listens on loopback only.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
ufw status verbose
```

If hPanel's VPS firewall is in use, give it the same rules.

## 7. SSH: key only
First confirm, **in a second session**, that key login works (`ssh cave-vps true`). Then switch passwords off.

A drop-in named `10-…` wins over cloud-init's `50-cloud-init.conf`, because sshd keeps the first value it reads.

```bash
cat > /etc/ssh/sshd_config.d/10-cave.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
sshd -t && systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
```

Keep the first session open until a fresh `ssh cave-vps true` succeeds. The console still accepts the root password, which is why step 0 changes it.

## 8. Service and certificate

```bash
install -m 644 /opt/cave/current/deploy/cave.service /etc/systemd/system/cave.service
systemd-analyze verify /etc/systemd/system/cave.service
systemctl daemon-reload && systemctl enable --now cave
systemctl status cave --no-pager
```

Checks, from the laptop:

```bash
curl -I https://cave.alexjamesmx.dev                                      # 200, with Strict-Transport-Security
curl -s -o /dev/null -w "%{http_code}\n" https://cave.alexjamesmx.dev/api/status   # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://cave.alexjamesmx.dev/mcp -H 'content-type: application/json' -d '{}'   # 401
```

Run the token check from hPanel's browser terminal, so the token stays out of shared logs. `/api/status` with the token should answer 200.

From outside, port 3000 must not answer:

```bash
timeout 5 bash -c '</dev/tcp/203.0.113.10/3000' && echo OPEN || echo closed
```

## 9. Moving the data
1. Stop the laptop server.
2. On the laptop, run `bun run backup`.
3. Copy the newest backup to the VPS: `scp data/backups/<newest>.db cave-vps:/root/`.
4. Restore it on the VPS, with the service stopped:
   ```bash
   systemctl stop cave
   install -o cave -g cave -m 600 /root/<newest>.db /var/lib/cave/restore.db
   sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave/current && /opt/bun/bin/bun run restore /var/lib/cave/restore.db'
   systemctl start cave
   ```
5. Check `/api/status`: docs 694 or more. Also check October 2026 at 16,842 across 20 entries, via `money_month` over MCP or on the money dashboard.
6. Once those checks pass, delete both temporary copies of the data, and note in the log that they were deleted:
   ```bash
   rm /root/<newest>.db /var/lib/cave/restore.db
   ```
   The restored database and the set-aside `cave.db.before-restore-*` (an empty server's) remain.

## 10. Clients
- **Laptop:** open `https://cave.alexjamesmx.dev`, enter the server token in Settings and install the app. Uninstall the old `127.0.0.1` app; its data is already in the restored database.
- **Phone:** the same, over cellular data.
- **Claude Code:** the owner mints the agent token **in hPanel's browser terminal**, not over an SSH session, so it never enters Claude Code's own output:
  ```bash
  sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave/current && /opt/bun/bin/bun run agent add claude-code --scopes read,write'
  ```
  Then put it in `CAVE_AGENT_TOKEN` on the laptop and add the MCP entry from `docs/agents.md`.
- **Claude apps (desktop and phone):** a `claude-apps` agent token in a custom connector; see `docs/agents.md` "Claude apps".

## 11. Deploy on merge
A root-owned wrapper and a timer deploy the tip of `main` within minutes of a merge. Install them from `main` in the bare clone, never from a checkout that a deploy can change:

```bash
sudo -u cave git -C /opt/cave/repo.git fetch --quiet origin '+refs/heads/main:refs/heads/main'
for f in cave-deploy cave-deploy.service cave-deploy.timer; do
  sudo -u cave git -C /opt/cave/repo.git show "main:deploy/$f" > "/root/$f"
done
install -o root -g root -m 755 /root/cave-deploy /usr/local/sbin/cave-deploy
install -o root -g root -m 644 /root/cave-deploy.service /root/cave-deploy.timer /etc/systemd/system/
rm /root/cave-deploy /root/cave-deploy.service /root/cave-deploy.timer
install -d -o root -g root -m 755 /var/lib/cave-deploy
grep -q '^CAVE_DEPLOY_STATUS=' /etc/cave/cave.env || echo 'CAVE_DEPLOY_STATUS=/var/lib/cave-deploy/status.json' >> /etc/cave/cave.env
systemd-analyze verify /etc/systemd/system/cave-deploy.service /etc/systemd/system/cave-deploy.timer
systemctl daemon-reload
cave-deploy now                  # deploys the tip of main, or says it is already current
systemctl restart cave           # only if it was already current: picks up CAVE_DEPLOY_STATUS
systemctl enable --now cave-deploy.timer
systemctl list-timers cave-deploy.timer --no-pager
```

The service runs under `ProtectSystem=strict`, which makes `/var/lib/cave-deploy` read-only to it, not hidden; the directory is 755 and `status.json` 644, so `cave` can read it.

A change to `deploy/cave-deploy` or its units is a reviewed template change: after the merge, repeat the install lines above.

## Deploying and rolling back (after setup)
- **Merging to `main` deploys.** `cave-deploy.timer` runs `cave-deploy auto` 2 minutes after the last run ended. When the tip of `main` is new and not held, it:
  1. builds and tests it as `cave` in `releases/<sha>`, with that commit's own `deploy/release.sh`; only then is `current` switched;
  2. restarts `cave`;
  3. waits up to 20 seconds for `http://127.0.0.1:3000/api/status` to report the commit.

  A failed build leaves the running release untouched and holds the commit. An unhealthy restart rolls back to `previous`, restarts again and holds the commit. A held commit is skipped until a newer one lands on `main` or `cave-deploy now` retries it. Settings shows the last result.
- **`bun run deploy`**, from the laptop: checks for a clean tree whose `HEAD` is the tip of `origin/main`, runs `ssh cave-vps cave-deploy now` (deploys the tip even if held, waiting for a running deploy), then checks the public URL.
- **`bun run deploy --rollback`**: runs `cave-deploy rollback`, which points `current` at `previous`, restarts, checks health and holds the tip of `main`, so the timer doesn't ship it again. `cave-deploy now` brings the tip back.
- **On the VPS:** `cave-deploy status` prints the last result; `journalctl -u cave-deploy` shows each run's output.
- **Pause auto-deploy:** `systemctl stop cave-deploy.timer` until the next boot; `systemctl disable --now cave-deploy.timer` keeps it off. `systemctl enable --now cave-deploy.timer` turns it back on.
