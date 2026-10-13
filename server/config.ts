export interface ServerConfig {
  hostname: string;
  port: number;
  token: string | undefined;
  dbPath: string;
  /** Obsidian vault to import from, read-only; unset means no import. */
  vaultPath: string | undefined;
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
  return {
    ok: true,
    value: {
      hostname,
      port,
      token,
      dbPath: env.CAVE_DB_PATH || "data/cave.db",
      vaultPath: env.VAULT_PATH || undefined,
    },
  };
}
