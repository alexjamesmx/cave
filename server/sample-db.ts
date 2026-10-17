import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { localDate } from "../shared/dates.ts";
import { fieldsOf, formatFieldErrors, resolvedFieldsOf, validateFields } from "../shared/fields.ts";
import { Hlc } from "../shared/hlc.ts";
import { distinctValues, withAccounts } from "../shared/lists.ts";
import { zonedInstant } from "../shared/recurrence.ts";
import { seedDocs } from "../shared/seed.ts";
import type { Doc } from "../shared/types.ts";
import { openDb } from "./db.ts";
import { acquireLock, lockPathOf, releaseLock } from "./lock.ts";
import { sampleDocs } from "./sample-data.ts";
import { migrateSeed } from "./seed-migrations.ts";
import { createStore, type Store } from "./store.ts";
import { rejectInvalid } from "./validate.ts";

export const DEFAULT_SEED_DB = "data/seed.db";
/** The actor sample records carry: an owner's device, so the server treats them as records. */
export const SAMPLE_ACTOR = "user:seed-data";

export interface SeedArgs {
  db: string;
  reset: boolean;
}

export function parseSeedArgs(
  argv: string[],
): { ok: true; value: SeedArgs } | { ok: false; error: string } {
  let db = DEFAULT_SEED_DB;
  let reset = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reset") reset = true;
    else if (arg === "--db" && argv[i + 1]) db = argv[++i] as string;
    else return { ok: false, error: `unknown argument "${arg}"` };
  }
  return { ok: true, value: { db, reset } };
}

type Env = Record<string, string | undefined>;

/** Why `path` must not receive sample data, or `undefined` when it may. */
export function seedRefusal(path: string, reset: boolean, env: Env): string | undefined {
  if (env.CAVE_ENV === "production") return "CAVE_ENV=production; sample data never goes there";
  const target = resolve(path);
  if (target === resolve("/var/lib") || target.startsWith(`${resolve("/var/lib")}${sep}`))
    return `${target} is under /var/lib, where the hosted database lives`;
  if (target === resolve(env.CAVE_DB_PATH || "data/cave.db"))
    return `${target} is the database CAVE_DB_PATH points at; seed another file`;
  if (!reset && existsSync(target) && statSync(target).size > 0)
    return `${target} already has data; pass --reset to replace it`;
  return undefined;
}

// Sample records are owner records: device writes check select membership and refs, so the
// seed does too, and any failure is a bug in the sample data.
function assertValid(store: Store, docs: Doc[]): void {
  const pending = new Map(docs.map((d) => [d.id, d]));
  const target = (id: string) => pending.get(id) ?? store.get(id);
  for (const doc of docs) {
    const fields = resolvedFieldsOf(store.get(doc.collection ?? ""), store.get);
    const errors = validateFields(fields, doc.data, { refTarget: target });
    if (errors.length > 0) throw new Error(`sample ${doc.id}: ${formatFieldErrors(errors)}`);
  }
  const { rejected } = rejectInvalid(docs, store.get);
  if (rejected.length > 0) throw new Error(`sample ${rejected[0]?.id}: ${rejected[0]?.error}`);
}

/** The local start of the day `now` falls on, in the seed's timezone: every stamp's time. */
export function seedDay(now: number): { today: string; at: number } {
  const zone = String(seedDocs().find((d) => d.id === "settings")?.data.timezone);
  const today = localDate(new Date(now), zone);
  return { today, at: zonedInstant(Date.parse(`${today}T00:00:00Z`), zone) };
}

/**
 * Writes the app's seed and the sample records into a new database at `path`, through the
 * same validation and merge the server applies to a device's push. Refuses the live database,
 * production and a file in use or with data (unless `reset`).
 */
export function seedDatabase(
  { db: path, reset }: SeedArgs,
  env: Env,
  now: number,
): { ok: true; path: string; docs: number; today: string } | { ok: false; error: string } {
  const refusal = seedRefusal(path, reset, env);
  if (refusal) return { ok: false, error: refusal };
  const target = resolve(path);
  // A fresh checkout has no data/ yet, and the lock sits next to the database.
  mkdirSync(dirname(target), { recursive: true });
  const lock = lockPathOf(target);
  const acquired = acquireLock(lock);
  if (!acquired.ok) return { ok: false, error: `a server (pid ${acquired.pid}) uses ${target}` };
  try {
    for (const file of [target, `${target}-wal`, `${target}-shm`]) rmSync(file, { force: true });
    const { today, at } = seedDay(now);
    const db = openDb(target);
    try {
      const store = createStore(db);
      store.seedIfEmpty(seedDocs(), at);
      migrateSeed(store, at);
      const clock = new Hlc("seed-data", () => at);
      const docs: Doc[] = sampleDocs(today, new Date(at).toISOString()).map((s) => {
        const stamp = clock.next();
        return {
          id: s.id,
          kind: "item",
          collection: s.collection,
          data: s.data,
          stamps: Object.fromEntries(Object.keys(s.data).map((k) => [k, stamp])),
          actor: SAMPLE_ACTOR,
        };
      });
      // The samples' accounts join the accounts list first, as "New account" would.
      const accounts = distinctValues(
        docs.filter((d) => d.collection === "money" || d.collection === "payments"),
        "account",
      );
      const fields = withAccounts(fieldsOf(store.get("money")), accounts);
      const stamp = clock.next();
      store.applyChanges(
        [
          {
            id: "money",
            kind: "collection",
            collection: null,
            data: { fields },
            stamps: { fields: stamp },
            actor: SAMPLE_ACTOR,
          },
        ],
        SAMPLE_ACTOR,
        at,
      );
      assertValid(store, docs);
      store.applyChanges(docs, SAMPLE_ACTOR, at);
      return { ok: true, path: target, docs: store.docCount(), today };
    } finally {
      db.close();
    }
  } finally {
    releaseLock(lock);
  }
}
