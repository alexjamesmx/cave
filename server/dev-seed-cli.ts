import { DEFAULT_SEED_DB, seedDatabase } from "./sample-db.ts";

// Fresh sample data, then the dev server on it. The owner's settings never reach that server:
// it skips .env and gets none of the CAVE_ settings, so no token or notifier is live.
const seeded = seedDatabase({ db: DEFAULT_SEED_DB, reset: true }, process.env, Date.now());
if (!seeded.ok) {
  console.error(`Not seeded: ${seeded.error}`);
  process.exit(1);
}
console.log(`Seeded ${seeded.path}: ${seeded.docs} docs, dated from ${seeded.today}`);
// The app always asks for a token; a fixed one is fine on loopback with fake data.
const TOKEN = "seed";
console.log(`Unlock the app with the token "${TOKEN}"`);

const env: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("CAVE_") && key !== "BACKUP_DIR"),
);
env.CAVE_ENV = "dev";
env.CAVE_TOKEN = TOKEN;
env.CAVE_DB_PATH = seeded.path;
// Kept apart from data/backups, where a dev server on a copy of real data keeps its own.
env.BACKUP_DIR = `${seeded.path}-backups`;

const server = Bun.spawn(["bun", "--no-env-file", "run", "server/main.ts"], {
  cwd: `${import.meta.dir}/..`,
  env,
  stdio: ["inherit", "inherit", "inherit"],
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
process.exit(await server.exited);
