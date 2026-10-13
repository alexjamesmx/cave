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
  /**
   * Host names `/api` and `/mcp` answer to (DNS-rebinding protection): loopback, `CAVE_HOST`
   * unless it is a wildcard, and the comma list in `CAVE_ALLOWED_HOSTS`.
   */
  allowedHosts: string[];
}

const WILDCARDS = new Set(["0.0.0.0", "::", "[::]"]);

function allowedHosts(hostname: string, extra: string | undefined): string[] {
  const hosts = new Set(LOOPBACK_HOSTS);
  if (!WILDCARDS.has(hostname)) hosts.add(hostname.includes(":") ? `[${hostname}]` : hostname);
  for (const host of (extra ?? "").split(","))
    if (host.trim()) hosts.add(host.trim().toLowerCase());
  return [...hosts];
}

type Env = Record<string, string | undefined>;

const isLoopback = (host: string) =>
  host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);

/**
 * Reads server settings from the environment. Listening beyond loopback without a token
 * would expose every record to the local network, so that combination is refused.
 */
export function resolveConfig(
  env: Env,
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
      allowedHosts: allowedHosts(hostname, env.CAVE_ALLOWED_HOSTS),
    },
  };
}
