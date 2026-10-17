import { dirname, join } from "node:path";
import { type CaveEnv, parseCaveEnv } from "./env.ts";
import { LOOPBACK_HOSTS } from "./request-guard.ts";

export interface ServerConfig {
  /** `production` is the only one that delivers outside the Cave (`server/env.ts`). */
  env: CaveEnv;
  hostname: string;
  port: number;
  token: string | undefined;
  dbPath: string;
  /** Obsidian vault to import from, read-only; unset means no import. */
  vaultPath: string | undefined;
  /** Where backups go; next to the database unless `BACKUP_DIR` says otherwise. */
  backupDir: string;
  /** The `https:` origin browsers use behind a reverse proxy, e.g. `https://cave.example.dev`. */
  publicOrigin: string | undefined;
  /**
   * Host names `/api` and `/mcp` answer to (DNS-rebinding protection): loopback, `CAVE_HOST`
   * unless it is a wildcard, the public origin's host and the comma list in `CAVE_ALLOWED_HOSTS`.
   */
  allowedHosts: string[];
  /** `status.json` written by `cave-deploy`; unset means `/api/status` reports no deploy. */
  deployStatusPath: string | undefined;
  /** `status.json` written by `cave-offsite`; unset or missing means off-box backups are not set up. */
  offsiteStatusPath: string | undefined;
  /** Web Push (VAPID) keys; all three or none, and none means push is off. */
  push: VapidKeys | undefined;
  /** The Telegram bot's token; never logged or sent to a client. */
  telegramToken: string | undefined;
  /** The Discord channel webhook; anyone holding it can post, so it is a secret too. */
  discordWebhook: string | undefined;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** `mailto:` the owner, or the app's https origin: push services contact it on abuse. */
  subject: string;
}

const base64urlBytes = (value: string) =>
  /^[A-Za-z0-9_-]+$/.test(value) ? Buffer.from(value, "base64url").length : -1;

// Checked here so a mistake stops the server at start, naming the setting but never its value.
function readVapid(
  env: Env,
): { ok: true; value: VapidKeys | undefined } | { ok: false; error: string } {
  const names = ["CAVE_VAPID_PUBLIC", "CAVE_VAPID_PRIVATE", "CAVE_VAPID_SUBJECT"] as const;
  const missing = names.filter((n) => !env[n]);
  if (missing.length === names.length) return { ok: true, value: undefined };
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Web Push needs all three VAPID settings; missing: ${missing.join(", ")}`,
    };
  }
  const [publicKey, privateKey, subject] = names.map((n) => env[n] as string) as [
    string,
    string,
    string,
  ];
  // An uncompressed P-256 point is 65 bytes and starts with 0x04.
  if (base64urlBytes(publicKey) !== 65 || Buffer.from(publicKey, "base64url")[0] !== 4)
    return {
      ok: false,
      error: "CAVE_VAPID_PUBLIC must be a base64url P-256 public key (65 bytes)",
    };
  if (base64urlBytes(privateKey) !== 32)
    return {
      ok: false,
      error: "CAVE_VAPID_PRIVATE must be a base64url P-256 private key (32 bytes)",
    };
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject))
    return { ok: false, error: "CAVE_VAPID_SUBJECT must be a mailto: address or an https: URL" };
  return { ok: true, value: { publicKey, privateKey, subject } };
}

const TELEGRAM_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

/** A Discord channel webhook: `https://discord.com/api/webhooks/…` (or discordapp.com). */
export function isDiscordWebhook(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
    /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
  );
}

const WILDCARDS = new Set(["0.0.0.0", "::", "[::]"]);

/** A token long enough that guessing it over the network is hopeless. */
export const MIN_PUBLIC_TOKEN_CHARS = 32;

function allowedHosts(
  hostname: string,
  extra: string | undefined,
  publicOrigin: string | undefined,
): string[] {
  const hosts = new Set(LOOPBACK_HOSTS);
  if (publicOrigin) hosts.add(new URL(publicOrigin).hostname);
  if (!WILDCARDS.has(hostname)) hosts.add(hostname.includes(":") ? `[${hostname}]` : hostname);
  for (const host of (extra ?? "").split(","))
    if (host.trim()) hosts.add(host.trim().toLowerCase());
  return [...hosts];
}

type Env = Record<string, string | undefined>;

const isLoopback = (host: string) =>
  host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);

// An origin is scheme, host and port only; anything else in the value is a mistake.
function parsePublicOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    const bare = url.pathname === "/" && !url.search && !url.hash && !url.username;
    return url.protocol === "https:" && bare && value.replace(/\/$/, "") === url.origin
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads server settings from the environment. Listening beyond loopback without a token
 * would expose every record to the local network, so that combination is refused. Behind a
 * reverse proxy every request arrives from loopback, so a public origin needs a token too,
 * and in production a long one.
 */
export function resolveConfig(
  env: Env,
  { production = false }: { production?: boolean } = {},
): { ok: true; value: ServerConfig } | { ok: false; error: string } {
  const caveEnv = parseCaveEnv(env.CAVE_ENV);
  if (!caveEnv.ok) return caveEnv;
  const hostname = env.CAVE_HOST || "127.0.0.1";
  const token = env.CAVE_TOKEN || undefined;
  const port = Number(env.PORT || 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: `PORT must be an integer from 1 to 65535, got "${env.PORT}"` };
  }
  if (!isLoopback(hostname) && !token) {
    return {
      ok: false,
      error: `CAVE_HOST=${hostname} is reachable from other machines; set CAVE_TOKEN to start`,
    };
  }
  const publicOrigin = env.CAVE_PUBLIC_ORIGIN
    ? parsePublicOrigin(env.CAVE_PUBLIC_ORIGIN)
    : undefined;
  if (env.CAVE_PUBLIC_ORIGIN && !publicOrigin) {
    return {
      ok: false,
      error: `CAVE_PUBLIC_ORIGIN must be an https origin like https://cave.example.dev, got "${env.CAVE_PUBLIC_ORIGIN}"`,
    };
  }
  if (publicOrigin && !token) {
    return {
      ok: false,
      error:
        "CAVE_PUBLIC_ORIGIN is set: every request arrives through the proxy, so set CAVE_TOKEN",
    };
  }
  if (publicOrigin && production && (token?.length ?? 0) < MIN_PUBLIC_TOKEN_CHARS) {
    return {
      ok: false,
      error: `CAVE_TOKEN must be at least ${MIN_PUBLIC_TOKEN_CHARS} characters when the server is public`,
    };
  }
  const push = readVapid(env);
  if (!push.ok) return push;
  const telegramToken = env.CAVE_TELEGRAM_BOT_TOKEN || undefined;
  if (telegramToken && !TELEGRAM_TOKEN_RE.test(telegramToken)) {
    return {
      ok: false,
      error: "CAVE_TELEGRAM_BOT_TOKEN must look like the token @BotFather gives",
    };
  }
  const discordWebhook = env.CAVE_DISCORD_WEBHOOK_URL || undefined;
  if (discordWebhook && !isDiscordWebhook(discordWebhook)) {
    return {
      ok: false,
      error: "CAVE_DISCORD_WEBHOOK_URL must be a https://discord.com/api/webhooks/… URL",
    };
  }
  const dbPath = env.CAVE_DB_PATH || "data/cave.db";
  return {
    ok: true,
    value: {
      env: caveEnv.value,
      hostname,
      port,
      token,
      dbPath,
      vaultPath: env.VAULT_PATH || undefined,
      backupDir: env.BACKUP_DIR || join(dirname(dbPath), "backups"),
      publicOrigin,
      allowedHosts: allowedHosts(hostname, env.CAVE_ALLOWED_HOSTS, publicOrigin),
      deployStatusPath: env.CAVE_DEPLOY_STATUS || undefined,
      offsiteStatusPath: env.CAVE_OFFSITE_STATUS || undefined,
      push: push.value,
      telegramToken,
      discordWebhook,
    },
  };
}
