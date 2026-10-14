import { dirname, join } from "node:path";
import { LOOPBACK_HOSTS } from "./request-guard.ts";

export interface ServerConfig {
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
  const dbPath = env.CAVE_DB_PATH || "data/cave.db";
  return {
    ok: true,
    value: {
      hostname,
      port,
      token,
      dbPath,
      vaultPath: env.VAULT_PATH || undefined,
      backupDir: env.BACKUP_DIR || join(dirname(dbPath), "backups"),
      publicOrigin,
      allowedHosts: allowedHosts(hostname, env.CAVE_ALLOWED_HOSTS, publicOrigin),
    },
  };
}
