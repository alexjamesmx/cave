import { formatStamp } from "../shared/hlc.ts";
import { SEED_MIGRATIONS } from "../shared/seed.ts";
import type { Doc } from "../shared/types.ts";
import type { Store } from "./store.ts";

/** Databases seeded before seed migrations existed have no `seedVersion`: they are 1. */
export function seedVersionOf(store: Store): number {
  const version = store.get("settings")?.data.seedVersion;
  return typeof version === "number" ? version : 1;
}

/**
 * Applies the seed migrations a database has not had yet, as stamped writes with actor
 * `seed`, and bumps `settings.seedVersion` in the same transaction. Editing `seed.ts` alone
 * never reaches an existing database. Returns the versions applied.
 */
export function migrateSeed(store: Store, now: number): number[] {
  const current = seedVersionOf(store);
  const pending = SEED_MIGRATIONS.filter((m) => m.version > current);
  const last = pending.at(-1);
  if (!last) return [];
  const stamp = formatStamp(now, 0, "seed");
  const stamped = (id: string, kind: Doc["kind"], data: Record<string, unknown>): Doc => ({
    id,
    kind,
    collection: null,
    data: structuredClone(data),
    stamps: Object.fromEntries(Object.keys(data).map((key) => [key, stamp])),
    actor: "seed",
  });
  const docs = pending.flatMap((m) => m.docs.map((d) => stamped(d.id, d.kind, d.data)));
  docs.push(stamped("settings", "setting", { seedVersion: last.version }));
  store.applyChanges(docs, "seed", now);
  return pending.map((m) => m.version);
}
