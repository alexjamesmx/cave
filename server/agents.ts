import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { isDocId } from "../shared/ids.ts";

export const SCOPES = ["read", "write"] as const;
export type Scope = (typeof SCOPES)[number];

export interface Agent {
  name: string;
  scopes: Scope[];
  /** Collections the agent may see; `null` means all. */
  collections: string[] | null;
  created: number;
  revoked: number | null;
}

interface AgentRow {
  name: string;
  token_hash: string;
  scopes: string;
  collections: string | null;
  created: number;
  revoked: number | null;
}

const NAME_RE = /^[a-z0-9-]{1,32}$/;
export const TOKEN_PREFIX = "cave_";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const toAgent = (row: AgentRow): Agent => ({
  name: row.name,
  scopes: JSON.parse(row.scopes),
  collections: row.collections === null ? null : JSON.parse(row.collections),
  created: row.created,
  revoked: row.revoked,
});

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface AgentRegistry {
  /** Mints a token for a new agent. The token is returned once and never stored. */
  add(
    name: string,
    scopes: string[],
    collections: string[] | null,
    now: number,
  ): Result<{ agent: Agent; token: string }>;
  list(): Agent[];
  get(name: string): Agent | undefined;
  revoke(name: string, now: number): boolean;
  /** The active agent a bearer token belongs to; revoked and unknown tokens get `undefined`. */
  authenticate(token: string): Agent | undefined;
}

export function createAgentRegistry(db: Database): AgentRegistry {
  const insert = db.query<never, [string, string, string, string | null, number]>(
    "INSERT INTO agents (name, token_hash, scopes, collections, created) VALUES (?, ?, ?, ?, ?)",
  );
  const byName = db.query<AgentRow, [string]>("SELECT * FROM agents WHERE name = ?");
  // The token carries 256 random bits, so looking it up by its hash leaks nothing useful.
  const byHash = db.query<AgentRow, [string]>(
    "SELECT * FROM agents WHERE token_hash = ? AND revoked IS NULL",
  );
  const all = db.query<AgentRow, []>("SELECT * FROM agents ORDER BY name");
  const revoke = db.query<never, [number, string]>(
    "UPDATE agents SET revoked = ? WHERE name = ? AND revoked IS NULL",
  );

  return {
    add(name, scopes, collections, now) {
      if (!NAME_RE.test(name)) return { ok: false, error: "name must match [a-z0-9-]{1,32}" };
      if (byName.get(name)) return { ok: false, error: `agent ${name} already exists` };
      const unique = [...new Set(scopes)];
      if (unique.length === 0 || !unique.every((s) => SCOPES.includes(s as Scope))) {
        return { ok: false, error: "scopes must be read, write or both" };
      }
      if (collections !== null && (collections.length === 0 || !collections.every(isDocId))) {
        return { ok: false, error: "collections must be collection ids" };
      }
      const token = `${TOKEN_PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
      insert.run(
        name,
        hashToken(token),
        JSON.stringify(unique),
        collections === null ? null : JSON.stringify(collections),
        now,
      );
      const row = byName.get(name) as AgentRow;
      return { ok: true, value: { agent: toAgent(row), token } };
    },
    list: () => all.all().map(toAgent),
    get: (name) => {
      const row = byName.get(name);
      return row ? toAgent(row) : undefined;
    },
    revoke: (name, now) => revoke.run(now, name).changes > 0,
    authenticate: (token) => {
      if (!token.startsWith(TOKEN_PREFIX)) return undefined;
      const row = byHash.get(hashToken(token));
      return row ? toAgent(row) : undefined;
    },
  };
}
