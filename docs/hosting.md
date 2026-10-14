# Hosting runbook (first-time server setup)

The one-time setup of the VPS, run step by step. Each step is shown to the owner and run only with their approval. Its real output goes into the milestone log, with secrets redacted.

- **Target:**
  - Hostinger KVM 2, Ubuntu 26.04 LTS;
  - reached as `ssh cave-vps` (root, key only) from the laptop;
  - served at `cave.alexjamesmx.dev`, whose A and AAAA records point at the VPS.
- **Templates:** in `deploy/`. Steps that copy them read them from the clone in `/opt/cave`.

**Secrets rule.** The server token is generated on the VPS. It is never printed into a shared terminal or a log, and never put on a command line, where any user could see it in `ps`. Commands that need the settings read `/etc/cave/cave.env` inside the shell. The owner reads the token once in hPanel's browser terminal and keeps it in a password manager.

## 1. User and directories
`cave` is a system user with no login shell. Its home is its data directory.

```bash
useradd --system --home-dir /var/lib/cave --shell /usr/sbin/nologin cave
install -d -o cave -g cave -m 700 /var/lib/cave
install -d -o cave -g cave -m 755 /opt/cave
```

## 2. Bun, pinned
Install the version the repo and CI use, into `/opt/bun`: root-owned and readable by the service. The installer needs `unzip`. Download the script first and read it before running it.

```bash
apt-get update && apt-get install -y unzip
curl -fsSL https://bun.com/install -o /root/bun-install.sh
BUN_INSTALL=/opt/bun bash /root/bun-install.sh bun-v1.4.3
/opt/bun/bin/bun --version        # expect 1.4.3
```

## 3. Deploy key and clone
The VPS reads the private repo with a **read-only** deploy key. The key is created on the VPS, and only its public half leaves it.

```bash
install -d -o cave -g cave -m 700 /var/lib/cave/.ssh
sudo -u cave ssh-keygen -t ed25519 -N "" -C "cave-vps-deploy" -f /var/lib/cave/.ssh/id_ed25519
cat /var/lib/cave/.ssh/id_ed25519.pub
```

On the laptop, add that public key to the repo as read-only (the default):

```bash
ssh cave-vps cat /var/lib/cave/.ssh/id_ed25519.pub > cave-vps-deploy.pub
gh repo deploy-key add cave-vps-deploy.pub --repo alexjamesmx/cave --title cave-vps
rm cave-vps-deploy.pub
```

Pin GitHub's host key, checking it against GitHub's published fingerprint (`gh api meta`). ED25519 is `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`.

```bash
ssh-keyscan -t ed25519 github.com | sudo -u cave tee /var/lib/cave/.ssh/known_hosts
ssh-keygen -lf /var/lib/cave/.ssh/known_hosts
```

Then clone, and run a first install and the checks:

```bash
sudo -u cave git clone git@github.com:alexjamesmx/cave.git /opt/cave
cd /opt/cave
sudo -u cave env PATH=/opt/bun/bin:$PATH bun install --frozen-lockfile
sudo -u cave env PATH=/opt/bun/bin:$PATH bun run check
sudo -u cave env PATH=/opt/bun/bin:$PATH bun test
```

## 4. Server settings and token
`/etc/cave/cave.env` belongs to root, with group `cave` and mode 640. The token is written straight into the file and is never echoed.

```bash
install -d -o root -g cave -m 750 /etc/cave
install -o root -g cave -m 640 /opt/cave/deploy/cave.env.example /etc/cave/cave.env
sed -i '/^CAVE_TOKEN=$/d' /etc/cave/cave.env
# printf is a shell builtin, so the token never appears in any process's arguments.
printf 'CAVE_TOKEN=%s\n' "$(openssl rand -base64 48)" >> /etc/cave/cave.env
grep -c '^CAVE_TOKEN=.\{64\}$' /etc/cave/cave.env    # expect 1, without showing the value
```

The owner then reads it once in hPanel's browser terminal (`grep ^CAVE_TOKEN= /etc/cave/cave.env`) and stores it in a password manager. It is also the laptop's `CAVE_REMOTE_TOKEN`, used for deploys.

## 5. Caddy
Install from Caddy's official repository; its `any-version` source works on Ubuntu 26.04. First confirm 80 and 443 are still free (`ss -tlnp`).

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
install -m 644 /opt/cave/deploy/Caddyfile /etc/caddy/Caddyfile
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

Keep the first session open until a fresh `ssh cave-vps true` succeeds.

## 8. Service and certificate

```bash
install -m 644 /opt/cave/deploy/cave.service /etc/systemd/system/cave.service
visudo -cf /opt/cave/deploy/sudoers-cave && install -m 440 /opt/cave/deploy/sudoers-cave /etc/sudoers.d/cave
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
   sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave && /opt/bun/bin/bun run restore /var/lib/cave/restore.db'
   systemctl start cave
   ```
5. Check `/api/status`: docs 694 or more. Also check October 2026 at 16,842 across 20 entries, via `money_month` over MCP or on the money dashboard.

## 10. Clients
- **Laptop:** open `https://cave.alexjamesmx.dev`, enter the token in Settings and install the app. Uninstall the old `127.0.0.1` app; its data is already in the restored database.
- **Phone:** the same, over cellular data.
- **Claude Code:**
  - mint an agent token on the VPS:
    ```bash
    sudo -u cave bash -c 'set -a; . /etc/cave/cave.env; set +a; cd /opt/cave && /opt/bun/bin/bun run agent add claude-code --scopes read,write'
    ```
  - add the MCP entry from `docs/agents.md`.
