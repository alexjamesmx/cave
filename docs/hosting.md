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
  | `/etc/cave/cave.env` | server settings and token; must set `CAVE_ENV=production` (step 13) |
  | `/usr/local/sbin/cave-offsite` | the off-box backup script, root-owned, installed by hand from `deploy/cave-offsite` (step 14) |
  | `/usr/local/bin/restic` | restic 0.19.1, root-owned, signature-checked (step 14) |
  | `/etc/cave/offsite.env`, `/etc/cave/offsite.key` | the R2 keys and the restic password, `root:cave` 640 |
  | `/var/lib/cave-offsite` | `cave-offsite`'s `status.json` (the Cave reads it) and `counts` (each daily backup's doc count) |
  | `/var/cache/cave-offsite` | restic's cache |
- **Templates:** in `deploy/`. Steps that copy them read them from `/opt/cave/current/deploy/`.

**Rules:**
- **Secrets.** Tokens are generated on the VPS and never printed into a shared terminal, Claude Code's session or a log. They never go on a command line either, where any user could see them in `ps`. Commands that need the settings read `/etc/cave/cave.env` inside the shell. The owner reads each token once in **hPanel's browser terminal** and keeps it in a password manager.
- **Privileges.** `cave` has **no sudo rights**. It builds releases; `cave-deploy`, running as root, restarts the service. Code merged to `main` never runs as root: the wrapper only runs each commit's `release.sh` as `cave`.

## 0. Prerequisites
- **The M5 code is on `origin/main`.** `deploy/release.sh` builds only commits on `origin/main`, and the server needs `CAVE_PUBLIC_ORIGIN` support to run behind Caddy.
- **The laptop key.** `~/.ssh/id_ed25519` in the laptop's WSL Ubuntu opens root on the VPS. By the owner's choice it has no passphrase (`docs/decisions.md`, 2026-10-21), so the laptop's disk and WSL account are what guard it. A passphrase can be added at any time with `ssh-keygen -p -f ~/.ssh/id_ed25519`, with the user `ssh-agent` holding it (`docs/system.md` section 6, "SSH to the VPS").
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

The template sets `CAVE_ENV=production`: without it the server runs as `dev`, sends nothing, and `release.sh` refuses to switch to a new release (step 13). `grep -c '^CAVE_ENV=production$' /etc/cave/cave.env` must print 1.

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
- **Laptop:** open `https://cave.alexjamesmx.dev`, unlock it with the server token and install the app. Uninstall the old `127.0.0.1` app; its data is already in the restored database.
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
sed -i -e '$a\' /etc/cave/cave.env    # a final newline, so the append can't join the last line
grep -q '^CAVE_DEPLOY_STATUS=' /etc/cave/cave.env || echo 'CAVE_DEPLOY_STATUS=/var/lib/cave-deploy/status.json' >> /etc/cave/cave.env
systemd-analyze verify /etc/systemd/system/cave-deploy.service /etc/systemd/system/cave-deploy.timer
systemctl daemon-reload
cave-deploy now
```

If `cave-deploy now` said "already current", run `systemctl restart cave`, so the server reads `CAVE_DEPLOY_STATUS`. Otherwise the deploy already restarted it. Then turn the timer on:

```bash
systemctl enable --now cave-deploy.timer
systemctl list-timers cave-deploy.timer --no-pager
```

The service runs under `ProtectSystem=strict`, which makes `/var/lib/cave-deploy` read-only to it, not hidden; the directory is 755 and `status.json` 644, so `cave` can read it.

A change to `deploy/cave-deploy` or its units is a reviewed template change: after the merge, repeat the install lines above.

## 12. Notifications
Web Push, Telegram and Discord are each optional: a channel without its settings shows what it needs in Settings → Notifications. Every secret goes into `/etc/cave/cave.env` without being shown on screen. Run these in **hPanel's browser terminal**, as root.

**Web Push.** `bun run push-keys` prints three env lines (the subject is `CAVE_PUBLIC_ORIGIN`); appending them keeps the private key off the screen. It refuses when keys already exist: new keys unsubscribe every device.
```bash
sed -i '/^CAVE_VAPID_[A-Z]*=$/d' /etc/cave/cave.env      # drops empty template lines, if any
sed -i -e '$a\' /etc/cave/cave.env                         # a final newline before appending
sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave/current && /opt/bun/bin/bun run push-keys' >> /etc/cave/cave.env
grep -c '^CAVE_VAPID_[A-Z]*=.' /etc/cave/cave.env          # expect 3
systemctl restart cave
```

**Telegram.** Create a bot with @BotFather and copy its token. `read -rs` takes it without echoing it:
```bash
sed -i -e '$a\' /etc/cave/cave.env
read -rs TG && printf 'CAVE_TELEGRAM_BOT_TOKEN=%s\n' "$TG" >> /etc/cave/cave.env; unset TG
systemctl restart cave
```
Then Settings → Notifications → Telegram → **Link** shows a code; send `/start <code>` to the bot within 10 minutes. Only that chat is ever answered. **Unlink** clears it.

**Discord.** In a private server, a channel named `cave`: Channel settings → Integrations → Webhooks → New webhook → Copy URL. Set the channel's notifications to "All messages" on the phone.
```bash
sed -i -e '$a\' /etc/cave/cave.env
read -rs DW && printf 'CAVE_DISCORD_WEBHOOK_URL=%s\n' "$DW" >> /etc/cave/cave.env; unset DW
systemctl restart cave
```
The server refuses to start with a malformed token or webhook URL, naming the setting but never its value.

**Egress.** The firewall allows outgoing traffic (step 6). The server reaches the push services (`*.push.apple.com`, `fcm.googleapis.com`, Mozilla's `*.push.services.mozilla.com`), `api.telegram.org` and `discord.com` with Bun's `fetch` and a 10-second timeout; nothing else on the server sends anything.

## 12b. The Content-Security-Policy (M9)
Caddy sends a strict `Content-Security-Policy` with every response (`deploy/Caddyfile`): only this origin's scripts, styles, images, fonts and connections, no eval, no inline script, no plugins, no framing. The timer deploys the app, not Caddy's configuration, so **after the PR that adds it merges**, install it once in hPanel's terminal (step 5's two commands, then a reload):
```bash
install -m 644 /opt/cave/current/deploy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
curl -sI https://cave.alexjamesmx.dev/ | grep -i content-security-policy
```
The last line should print the policy. If the app misbehaves, the browser console names the blocked resource; `docs/log/m9.md` records what was measured.

## 13. CAVE_ENV (M6b)
`CAVE_ENV` is `production`, `dev` or `test`; unset means `dev`, and any other value stops the server at start. Only `production` delivers anything outside the Cave: Web Push, Telegram (its long polling too) and Discord, and so every flow `notify` step. In `dev` and `test` jobs and flows still run, but each send becomes a `notification_log` row with result `outbox`, listed under `/system` → Notifications → Dev outbox, and the app shows a `DEV` or `TEST` badge. `bun test` runs as `test` (`bunfig.toml`), as does the Playwright server; `bun run dev:seed` runs as `dev`.

`deploy/release.sh` fails a build unless `/etc/cave/cave.env` sets `CAVE_ENV=production` (the last `CAVE_ENV=` line counts, quotes allowed). The failure is at step `env`, before anything is built: `cave-deploy` holds the commit, Settings shows "failed at env", and the running release stays up. `cave-deploy` itself needs no reinstall.

**Existing server, before the M6b PR merges** (hPanel's browser terminal, as root):
```bash
grep -q '^CAVE_ENV=' /etc/cave/cave.env || sed -i '1i CAVE_ENV=production' /etc/cave/cave.env
grep -c '^CAVE_ENV=production$' /etc/cave/cave.env    # expect 1
```
No restart is needed: the running release ignores the setting, and the next release reads it.

## 14. Off-box backups (M6b)
Every day `cave-offsite backup` sends an encrypted copy of `/var/lib/cave/backups` to Cloudflare R2 with restic, and every week `cave-offsite check` reads 10% of the repository, restores the newest daily backup and verifies it with the app. Both run as `cave`. `/system` and Settings show the last of each; the Cave notifies once (titles only) when the last successful backup is older than 48 hours or the last check failed. Without `status.json` the Cave shows "Not set up" and stays quiet.

**1. Cloudflare** (the owner, in the dashboard):
- turn on R2 (it may ask for a payment method even on the free tier);
- create the bucket `cave-backups`;
- create an R2 API token with **Object Read & Write**, scoped to `cave-backups` only, and note the account id, the access key id and the secret.

**2. Settings and the password** (hPanel's browser terminal, as root). Keys are read without echo: paste each `read` line **on its own**, then its value (pasted as a block, a `read` takes the next pasted line as its input). The password is generated on the VPS and shown once to go into the password manager. **Without it, the copies can't be decrypted.**
```bash
install -o root -g cave -m 640 /opt/cave/current/deploy/offsite.env.example /etc/cave/offsite.env
read -r ACCOUNT && sed -i "s|<account>|$ACCOUNT|" /etc/cave/offsite.env; unset ACCOUNT
read -rs KEY && sed -i "s|^AWS_ACCESS_KEY_ID=$|AWS_ACCESS_KEY_ID=$KEY|" /etc/cave/offsite.env; unset KEY
read -rs SECRET && sed -i "s|^AWS_SECRET_ACCESS_KEY=$|AWS_SECRET_ACCESS_KEY=$SECRET|" /etc/cave/offsite.env; unset SECRET
grep -c '^AWS_[A-Z_]*=.' /etc/cave/offsite.env           # expect 3 (key, secret, region)
( umask 027; openssl rand -base64 48 > /etc/cave/offsite.key )
chown root:cave /etc/cave/offsite.key && chmod 640 /etc/cave/offsite.key
cat /etc/cave/offsite.key    # once, in hPanel only: into the password manager, then clear the screen
```

**3. restic 0.19.1** from the GitHub release, not apt (Ubuntu's is older). The signature on `SHA256SUMS` is checked against restic's release key (Alexander Neumann, fingerprint `CF8F 18F2 8445 7597 3F79 D4E1 91A6 868B D3F7 A907`), then the binary's hash:
```bash
cd "$(mktemp -d)"
base=https://github.com/restic/restic/releases/download/v0.19.1
for f in SHA256SUMS SHA256SUMS.asc restic_0.19.1_linux_amd64.bz2; do curl -fsSLO "$base/$f"; done
export GNUPGHOME="$PWD/gnupg"; install -d -m 700 "$GNUPGHOME"
gpg --keyserver hkps://keyserver.ubuntu.com --recv-keys CF8F18F2844575973F79D4E191A6868BD3F7A907
gpg --verify SHA256SUMS.asc SHA256SUMS        # "Good signature", with the fingerprint above
sha256sum -c --ignore-missing SHA256SUMS       # restic_0.19.1_linux_amd64.bz2: OK
python3 -c 'import bz2, shutil; shutil.copyfileobj(bz2.open("restic_0.19.1_linux_amd64.bz2"), open("restic_0.19.1_linux_amd64", "wb"))'   # the VPS has no bunzip2
install -o root -g root -m 755 restic_0.19.1_linux_amd64 /usr/local/bin/restic
restic version                                 # restic 0.19.1 …
```
The SHA-256 of `restic_0.19.1_linux_amd64.bz2` is `f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c` (checked in a cloud session on 2026-10-16, with a good signature).

**4. Script, units, repository, first runs:**
```bash
install -o root -g root -m 755 /opt/cave/current/deploy/cave-offsite /usr/local/sbin/cave-offsite
for u in cave-offsite.service cave-offsite.timer cave-offsite-check.service cave-offsite-check.timer; do
  install -o root -g root -m 644 "/opt/cave/current/deploy/$u" "/etc/systemd/system/$u"
done
systemctl daemon-reload
runuser -u cave -- bash -c 'set -a; . /etc/cave/offsite.env; set +a; restic init --no-cache'
systemctl start cave-offsite.service && cave-offsite status          # backup ok
systemctl start cave-offsite-check.service && cave-offsite status    # check ok
systemctl enable --now cave-offsite.timer cave-offsite-check.timer
sed -i -e '$a\' /etc/cave/cave.env    # without a final newline the append joins the last line (2026-10-20: the Telegram token)
grep -q '^CAVE_OFFSITE_STATUS=' /etc/cave/cave.env ||
  echo 'CAVE_OFFSITE_STATUS=/var/lib/cave-offsite/status.json' >> /etc/cave/cave.env
systemctl restart cave
```
Commands run by hand pass `--no-cache`: restic's cache belongs to the units. The units create `/var/lib/cave-offsite` and `/var/cache/cave-offsite` (owned by `cave`), see the rest of the system read-only, and read the backups read-only. Backups run daily at 05:15 UTC and checks on Sundays at 06:15 UTC, each with up to 10 minutes' random delay, and catch up after downtime. The server has no fixed backup time (its hourly job takes one once 24 hours have passed), so the daily run always finds a daily backup under about 25 hours old.

**Known limit.** Root on the VPS can read the R2 keys and delete the copies. The laptop's pulled backups (`bun run pull-backups`, `bun run pull-data`) stay a third copy. R2 Object Lock would conflict with `forget --prune` and is out of scope.

## Restoring from R2
**On a new VPS.** Set it up through step 8 (the service stopped), install restic (step 14.3), write `/etc/cave/offsite.env` and `/etc/cave/offsite.key` again from the password manager (step 14.2), then:
```bash
runuser -u cave -- bash -c 'set -a; . /etc/cave/offsite.env; set +a; restic snapshots --no-cache'
runuser -u cave -- bash -c 'set -a; . /etc/cave/offsite.env; set +a; restic restore latest --no-cache --target /var/lib/cave/restore'
ls /var/lib/cave/restore/var/lib/cave/backups/    # pick the newest cave-YYYY-MM-DDTHHMM.db
systemctl stop cave
runuser -u cave -- bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave/current && /opt/bun/bin/bun run restore /var/lib/cave/restore/var/lib/cave/backups/<newest>.db'
systemctl start cave
rm -rf /var/lib/cave/restore
```
`bun run restore` verifies the file, keeps whatever it replaces and gives the database a new id; devices push back anything newer on their next sync.

**From the laptop**, with nothing on the VPS: install restic, then in a shell (the secret from the R2 dashboard, the password from the password manager; neither goes into a file in the repo):
```bash
export RESTIC_REPOSITORY=s3:https://<account>.r2.cloudflarestorage.com/cave-backups AWS_DEFAULT_REGION=auto
read -r AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; read -rs RESTIC_PASSWORD
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY RESTIC_PASSWORD
restic restore latest --target ./r2-restore
```
The newest `cave-YYYY-MM-DDTHHMM.db` under `./r2-restore/var/lib/cave/backups/` is a verified backup: `bun run verify-backup <file>` checks it, and `bun run restore <file>` (server stopped) loads it locally.

## Deploying and rolling back (after setup)
- **Merging to `main` deploys.** `cave-deploy.timer` runs `cave-deploy auto` 2 minutes after the last run ended. When the tip of `main` is new and not held, it:
  1. takes a verified backup with the running release's code (`bun run backup --dir $BACKUP_DIR/pre-deploy --keep 5 --sha <new commit>`, as `cave`): `/var/lib/cave/backups/pre-deploy/cave-<UTC time>-<short sha>.db`, named after the commit about to ship. The newest five are kept, apart from the daily and monthly backups;
  2. builds and tests it as `cave` in `releases/<sha>`, with that commit's own `deploy/release.sh`; only then is `current` switched;
  3. restarts `cave`;
  4. waits up to 20 seconds for `http://127.0.0.1:3000/api/status` to report the commit.

  A failed backup or build leaves the running release untouched and holds the commit. An unhealthy restart rolls back to `previous`, restarts again and holds the commit. A held commit is skipped until a newer one lands on `main` or `cave-deploy now` retries it. Settings shows the last result, and `status.json` names the backup.
- **A rollback across a migration does not come up.** A release that migrated the database leaves a schema the older release refuses to open, so the rolled-back server fails its health check too. The wrapper then prints the recovery; it is the same for an automatic rollback and for `cave-deploy rollback`:
  ```bash
  systemctl stop cave
  sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave/current && /opt/bun/bin/bun run restore /var/lib/cave/backups/pre-deploy/<the backup it names>'
  systemctl start cave
  ```
  - `current` already points at the release rolled back to. Don't roll back again: that would switch back to the migrated release.
  - The backup to restore is the one taken before the migrating deploy: the file named with that commit's short id.
  - The restore gives the database a new `db_id`, so devices push their newer edits back (M4).
- **`bun run deploy`**, from the laptop: checks for a clean tree whose `HEAD` is the tip of `origin/main`, runs `ssh cave-vps cave-deploy now` (deploys the tip even if held, waiting for a running deploy), then checks the public URL.
- **`bun run deploy --rollback`**: runs `cave-deploy rollback`, which points `current` at `previous`, restarts, checks health and holds the tip of `main`, so the timer doesn't ship it again. `cave-deploy now` brings the tip back.
- **From the phone:** for a bug in a healthy deploy, ask a cloud session to revert the change and merge the revert; in an emergency, run `cave-deploy rollback` in hPanel's browser terminal.
- **On the VPS:** `cave-deploy status` prints the last result; `journalctl -u cave-deploy` shows each run's output.
- **Pause auto-deploy:** `systemctl stop cave-deploy.timer` until the next boot; `systemctl disable --now cave-deploy.timer` keeps it off. `systemctl enable --now cave-deploy.timer` turns it back on.
