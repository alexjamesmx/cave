import { expect, test } from "bun:test";
import { DEFAULT_NOTIFICATIONS } from "../shared/notifications.ts";
import { SEED_VERSION, seedDocs } from "../shared/seed.ts";
import type { Doc } from "../shared/types.ts";
import { openDb } from "./db.ts";
import m2Seed from "./fixtures/m2-seed.json";
import { migrateSeed, seedVersionOf } from "./seed-migrations.ts";
import { createStore } from "./store.ts";

const NOW = 1_791_900_000_000;

test("a database seeded before seed migrations gets the proposals and the reminder time once", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(m2Seed as Doc[], 1);
  expect(store.get("proposals")).toBeUndefined();
  expect(seedVersionOf(store)).toBe(1);

  expect(migrateSeed(store, NOW)).toEqual([2, 3, 4, 5]);
  expect(store.get("flows")?.data).toMatchObject({ name: "Flows", hidden: true });
  expect(store.get("flow-rent")).toMatchObject({ collection: "flows", actor: "seed" });
  const proposals = store.get("proposals");
  expect(proposals?.data).toMatchObject({ name: "Proposals", hidden: true });
  expect(proposals?.actor).toBe("seed");
  expect(store.get("settings")?.data).toEqual({
    timezone: "America/Mexico_City",
    reminderTime: "09:00",
    notifications: DEFAULT_NOTIFICATIONS,
    seedVersion: SEED_VERSION,
  });
  // The migration and the version bump are one change batch with one actor and time.
  const log = store.changeLog().filter((c) => c.at === NOW);
  expect(log.map((c) => [c.id, c.actor])).toEqual([
    ["proposals", "seed"],
    ["settings", "seed"],
    ["settings", "seed"],
    ["flows", "seed"],
    ["flow-rent", "seed"],
    ["flow-salary", "seed"],
    ["settings", "seed"],
  ]);

  const length = store.changeLog().length;
  expect(migrateSeed(store, NOW + 1)).toEqual([]);
  expect(store.changeLog()).toHaveLength(length);
});

test("a fresh seed is already at the latest version", () => {
  const store = createStore(openDb(":memory:"));
  store.seedIfEmpty(seedDocs(), 1);
  expect(seedVersionOf(store)).toBe(SEED_VERSION);
  expect(migrateSeed(store, NOW)).toEqual([]);
  expect(store.get("proposals")?.data).toEqual(seedDocs().find((d) => d.id === "proposals")?.data);
});
