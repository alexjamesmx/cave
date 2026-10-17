import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../config.ts";
import { MAX_BODY_BYTES } from "../sync.ts";
import { WRAPPER } from "./deploy.ts";

const template = (name: string) =>
  readFileSync(join(import.meta.dir, "../../deploy", name), "utf8");

test("Caddy caps request bodies at the server's limit", () => {
  expect(MAX_BODY_BYTES).toBe(8 * 1024 * 1024);
  expect(template("Caddyfile")).toContain("max_size 8MiB");
});

test("Caddy sends the required security headers and proxies to the loopback port", () => {
  const caddy = template("Caddyfile");
  for (const header of [
    'Strict-Transport-Security "max-age=31536000"',
    'X-Content-Type-Options "nosniff"',
    'Referrer-Policy "no-referrer"',
    'X-Frame-Options "DENY"',
  ]) {
    expect(caddy).toContain(header);
  }
  expect(caddy).toContain("reverse_proxy 127.0.0.1:3000");
  expect(caddy).not.toContain("log_credentials");
});

test("the service runs production mode from /opt/cave with the hardening the spec names", () => {
  const unit = template("cave.service");
  for (const line of [
    "User=cave",
    "WorkingDirectory=/opt/cave/current",
    "EnvironmentFile=/etc/cave/cave.env",
    "ExecStart=/opt/bun/bin/bun run server/main.ts --production",
    "Restart=on-failure",
    "Environment=BUN_RUNTIME_TRANSPILER_CACHE_PATH=0",
    "NoNewPrivileges=true",
    "ProtectSystem=strict",
    "ReadWritePaths=/var/lib/cave",
    "PrivateTmp=true",
  ]) {
    expect(unit).toContain(line);
  }
});

test("the env template starts a public production server once a token is filled in", () => {
  const env = Object.fromEntries(
    template("cave.env.example")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string]),
  );
  expect(env.VAULT_PATH).toBeUndefined();
  expect(env.BUN_RUNTIME_TRANSPILER_CACHE_PATH).toBe("0");
  expect(env.CAVE_TOKEN).toBe("");
  expect(env.CAVE_DEPLOY_STATUS).toBe("/var/lib/cave-deploy/status.json");
  // Notification secrets ship empty: push is off and the channels say what they need.
  for (const key of [
    "CAVE_VAPID_PUBLIC",
    "CAVE_VAPID_PRIVATE",
    "CAVE_VAPID_SUBJECT",
    "CAVE_TELEGRAM_BOT_TOKEN",
    "CAVE_DISCORD_WEBHOOK_URL",
  ])
    expect(env[key]).toBe("");
  expect(resolveConfig(env, { production: true }).ok).toBe(false);
  const filled = resolveConfig({ ...env, CAVE_TOKEN: "x".repeat(64) }, { production: true });
  expect(filled.ok && filled.value).toMatchObject({
    dbPath: "/var/lib/cave/cave.db",
    backupDir: "/var/lib/cave/backups",
    publicOrigin: "https://cave.alexjamesmx.dev",
    port: 3000,
    hostname: "127.0.0.1",
    deployStatusPath: "/var/lib/cave-deploy/status.json",
  });
});

test("cave has no sudo rights: no sudoers template, and the release script never calls sudo", () => {
  expect(existsSync(join(import.meta.dir, "../../deploy/sudoers-cave"))).toBe(false);
  const script = template("release.sh");
  expect(script).not.toMatch(/\bsudo\b/);
  expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
  expect(script).toContain("set -Eeuo pipefail");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a JS template
  expect(script).toContain('export PATH="${CAVE_BUN_BIN:-/opt/bun/bin}:$PATH"');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a JS template
  expect(script).toContain('cache="${CAVE_CACHE_DIR:-/var/cache/cave-bun}"');
  for (const variable of [
    'BUN_INSTALL_CACHE_DIR="$cache"',
    'BUN_RUNTIME_TRANSPILER_CACHE_PATH="$cache/transpiler"',
    'XDG_CACHE_HOME="$cache/xdg"',
  ]) {
    expect(script).toContain(`export ${variable}`);
  }
  expect(script).toContain("bun install --frozen-lockfile");
});

test("the deploy wrapper defaults to the VPS paths and runs every build step as cave", () => {
  const wrapper = template("cave-deploy");
  expect(wrapper.startsWith("#!/usr/bin/env bash\n")).toBe(true);
  expect(wrapper).toContain("set -Eeuo pipefail");
  expect(wrapper).not.toMatch(/\bsudo\b/);
  for (const [name, variable, value] of [
    ["root", "CAVE_ROOT", "/opt/cave"],
    ["state", "CAVE_STATE_DIR", "/var/lib/cave-deploy"],
    ["env_file", "CAVE_ENV_FILE", "/etc/cave/cave.env"],
    ["health_url", "CAVE_HEALTH_URL", "http://127.0.0.1:3000/api/status"],
    ["lock", "CAVE_LOCK_FILE", "/run/cave-deploy.lock"],
    ["bun_bin", "CAVE_BUN_BIN", "/opt/bun/bin"],
  ]) {
    expect(wrapper).toContain(`${name}="$\{${variable}:-${value}}"`);
  }
  for (const line of [
    'as_cave() { runuser -u "$run_as" -- env HOME="$cave_home" CAVE_ROOT="$root" "$@"; }',
    'curl -q -fsS --max-time 3 -H "@$hdr"',
    "flock -n 9 || exit 0",
    "flock -w 600 9",
    "keep_backups=5",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a JS template
    '--dir "${BACKUP_DIR:?BACKUP_DIR is not set in $1}/pre-deploy" --keep "$4" --sha "$5"',
  ]) {
    expect(wrapper).toContain(line);
  }
});

test("the deploy units run the installed wrapper as root every 2 minutes after the last run", () => {
  const service = template("cave-deploy.service");
  for (const line of [
    "Type=oneshot",
    `ExecStart=${WRAPPER} auto`,
    "Environment=CAVE_RUN_AS=cave",
    "PrivateTmp=true",
    "ProtectHome=true",
    "ProtectKernelTunables=true",
    "ProtectKernelModules=true",
    "ProtectKernelLogs=true",
    "ProtectClock=true",
    "ProtectHostname=true",
    "ProtectControlGroups=true",
    "LockPersonality=true",
    "RestrictRealtime=true",
    "RestrictSUIDSGID=true",
    "SystemCallArchitectures=native",
    "RestrictNamespaces=true",
    "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK",
  ]) {
    expect(service).toContain(`\n${line}\n`);
  }
  // Each would break the job: Bun's JIT, git fetch, the root-only restart. The rest of the
  // review's list is tried one at a time on the VPS before it lands here.
  for (const directive of [
    "User",
    "MemoryDenyWriteExecute",
    "PrivateNetwork",
    "NoNewPrivileges",
    "PrivateDevices",
    "CapabilityBoundingSet",
    "ProtectSystem",
  ]) {
    expect(service).not.toMatch(new RegExp(`^${directive}=`, "m"));
  }
  const timer = template("cave-deploy.timer");
  for (const line of [
    "OnBootSec=2min",
    "OnUnitInactiveSec=2min",
    "Persistent=false",
    "Unit=cave-deploy.service",
    "WantedBy=timers.target",
  ]) {
    expect(timer).toContain(line);
  }
});

test("the off-box units run cave-offsite as cave, hardened, reading only the backups", () => {
  for (const [name, command] of [
    ["cave-offsite.service", "backup"],
    ["cave-offsite-check.service", "check"],
  ] as const) {
    const unit = template(name);
    for (const line of [
      "Type=oneshot",
      "User=cave",
      "EnvironmentFile=/etc/cave/offsite.env",
      `ExecStart=/usr/local/sbin/cave-offsite ${command}`,
      "NoNewPrivileges=true",
      "PrivateTmp=true",
      "ProtectSystem=strict",
      "ProtectHome=true",
      "ReadOnlyPaths=/var/lib/cave/backups",
      "ReadWritePaths=/var/lib/cave-offsite /var/cache/cave-offsite",
    ])
      expect(unit).toContain(line);
  }
  expect(template("cave-offsite.timer")).toContain("Unit=cave-offsite.service");
  expect(template("cave-offsite-check.timer")).toContain("Unit=cave-offsite-check.service");
  for (const timer of ["cave-offsite.timer", "cave-offsite-check.timer"])
    expect(template(timer)).toContain("Persistent=true");
});

test("the off-box env template holds no secret and points restic at R2 with region auto", () => {
  const env = template("offsite.env.example");
  for (const line of [
    "RESTIC_REPOSITORY=s3:https://<account>.r2.cloudflarestorage.com/cave-backups",
    "AWS_ACCESS_KEY_ID=\n",
    "AWS_SECRET_ACCESS_KEY=\n",
    "AWS_DEFAULT_REGION=auto",
    "RESTIC_PASSWORD_FILE=/etc/cave/offsite.key",
  ])
    expect(env).toContain(line);
  const script = template("cave-offsite");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell default, not a JS template
  expect(script).toContain('source_dir="${CAVE_OFFSITE_SOURCE:-/var/lib/cave/backups}"');
  expect(script).toContain("--exclude '*.failed' --exclude '*.part' --tag cave");
  expect(script).toContain("--keep-daily 30 --keep-monthly 24 --prune");
  expect(script).toContain("--read-data-subset=10%");
});

test("the server env template sets CAVE_ENV=production and the off-box status file", () => {
  const env = template("cave.env.example");
  expect(env).toMatch(/^CAVE_ENV=production$/m);
  expect(env).toMatch(/^CAVE_OFFSITE_STATUS=\/var\/lib\/cave-offsite\/status\.json$/m);
});

test("Claude Code settings: setup's template is the committed file, which turns the commit hook on", () => {
  const read = (path: string) => readFileSync(join(import.meta.dir, "../..", path), "utf8");
  const committed = read(".claude/settings.json");
  expect(read("setup/claude-settings.json")).toBe(committed);
  const settings = JSON.parse(committed);
  expect(settings.attribution).toEqual({ commit: "", pr: "", sessionUrl: false });
  expect(settings.hooks.SessionStart).toEqual([
    {
      matcher: "startup|resume",
      hooks: [
        {
          type: "command",
          command: "git",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: a Claude Code path placeholder
          args: ["-C", "${CLAUDE_PROJECT_DIR}", "config", "core.hooksPath", ".githooks"],
        },
        // After the commit hook: brings the branch up to date and lists other devices' wip.
        {
          type: "command",
          command: "bun",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: a Claude Code path placeholder
          args: ["run", "--silent", "--cwd", "${CLAUDE_PROJECT_DIR}", "sync"],
          timeout: 30,
        },
      ],
    },
  ]);
});

/**
 * A Bash rule as code.claude.com/docs/en/permissions describes it: the text matches as written,
 * `*` stands for any text, and a trailing ` *` that is the rule's only wildcard also matches the
 * bare command. Only what the deny list needs; Claude Code itself is the authority.
 */
function bashRuleMatches(rule: string, command: string): boolean {
  const pattern = /^Bash\((.*)\)$/.exec(rule)?.[1];
  if (pattern === undefined) return false;
  const literal = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const wildcards = pattern.split("*").length - 1;
  const source =
    wildcards === 1 && pattern.endsWith(" *")
      ? `${literal(pattern.slice(0, -2))}( .*)?`
      : pattern.split("*").map(literal).join(".*");
  return new RegExp(`^${source}$`).test(command);
}

test("no push is refused or asked; .env and data/ stay unreadable", () => {
  const settings = JSON.parse(
    readFileSync(join(import.meta.dir, "../../.claude/settings.json"), "utf8"),
  );
  const denied = (command: string) =>
    (settings.permissions.deny as string[]).some((rule) => bashRuleMatches(rule, command));
  const asked = (command: string) =>
    ((settings.permissions.ask ?? []) as string[]).some((rule) => bashRuleMatches(rule, command));
  // The owner removed the push prompt (2026-10-17): Claude Code pushes to main without asking.
  for (const command of ["git reset --hard HEAD~1", "git rebase main"])
    expect({ command, asked: asked(command) }).toEqual({ command, asked: false });
  expect(settings.permissions.deny).toEqual(
    expect.arrayContaining([
      "Read(/.env)",
      "Read(/.env.production)",
      "Read(/data/**)",
      "Edit(/data/**)",
    ]),
  );
  for (const command of [
    "git push",
    "git push origin main",
    "git push -u origin main",
    "git push origin HEAD:main",
    "git push --force origin HEAD:main",
    "git push -u origin m7-flows",
    "git push origin claude/fix-main-label",
    "git push --force origin m7-flows",
    "git push -f origin m7-flows",
  ]) {
    expect({ command, denied: denied(command), asked: asked(command) }).toEqual({
      command,
      denied: false,
      asked: false,
    });
  }
});

test("the cloud setup script pins Bun from npm and never installs dependencies", () => {
  const script = readFileSync(join(import.meta.dir, "../../setup/cloud-setup.sh"), "utf8");
  expect(script).toContain("BUN_VERSION=1.4.3");
  expect(script).toContain('npm install --global --no-fund --no-audit "bun@$BUN_VERSION"');
  expect(script).not.toMatch(/^[^#]*bun install/m);
  expect(script).not.toMatch(/^[^#]*bun\.sh/m);
});

test("Remote Control: one same-dir session in the default permission mode, restarted, run at logon", () => {
  const setup = (name: string) => readFileSync(join(import.meta.dir, "../../setup", name), "utf8");
  const loop = setup("remote-control.ps1");
  expect(loop).toContain("remote-control --name $name --spawn same-dir --capacity 1");
  expect(loop).toContain('$name = "cave $([char]0x00B7) laptop"');
  expect(loop).toContain("Start-Sleep -Seconds 30");
  expect(loop).not.toMatch(/permission-mode|bypass|dangerously/i);
  const task = setup("remote-control-task.ps1");
  expect(task).toContain("$taskName = 'Cave Remote Control'");
  expect(task).toContain("-AtLogOn -User $user");
  expect(task).toContain("-RunLevel Limited");
  expect(task).toContain("-WindowStyle Hidden");
  // The power setting is only suggested; the owner decides.
  expect(task).not.toMatch(/^\s*powercfg/m);
  const main = setup("setup.ps1");
  expect(main).toContain("param([switch]$RemoveRemoteControl)");
  expect(main).toContain("remote-control-task.ps1') -Remove");
  // PowerShell 5.1 reads a file without a BOM as ANSI; the scripts stay ASCII.
  for (const text of [loop, task, main])
    expect([...text].every((c) => (c.codePointAt(0) ?? 0) < 128)).toBe(true);
});
