import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../config.ts";
import { MAX_BODY_BYTES } from "../sync.ts";
import { RELEASE_SCRIPT_PATH } from "./deploy.ts";

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

test("cave has no sudo rights: no sudoers template, and the release script never calls sudo", () => {
  expect(existsSync(join(import.meta.dir, "../../deploy/sudoers-cave"))).toBe(false);
  const script = readFileSync(RELEASE_SCRIPT_PATH, "utf8");
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
