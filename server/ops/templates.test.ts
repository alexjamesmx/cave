import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../config.ts";
import { MAX_BODY_BYTES } from "../sync.ts";
import { REMOTE_SCRIPT } from "./deploy.ts";

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
    "WorkingDirectory=/opt/cave",
    "EnvironmentFile=/etc/cave/cave.env",
    "ExecStart=/opt/bun/bin/bun run server/main.ts --production",
    "Restart=on-failure",
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
  expect(env.CAVE_TOKEN).toBe("");
  expect(resolveConfig(env, { production: true }).ok).toBe(false);
  const filled = resolveConfig({ ...env, CAVE_TOKEN: "x".repeat(64) }, { production: true });
  expect(filled.ok && filled.value).toMatchObject({
    dbPath: "/var/lib/cave/cave.db",
    backupDir: "/var/lib/cave/backups",
    publicOrigin: "https://cave.alexjamesmx.dev",
    port: 3000,
    hostname: "127.0.0.1",
  });
});

test("the sudoers rule allows exactly the restart the deploy script runs", () => {
  const rule = template("sudoers-cave")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"));
  expect(rule).toEqual(["cave ALL=(root) NOPASSWD: /usr/bin/systemctl restart cave"]);
  expect(REMOTE_SCRIPT).toContain("sudo /usr/bin/systemctl restart cave");
  expect(REMOTE_SCRIPT).toContain('export PATH="/opt/bun/bin:$PATH"');
});
