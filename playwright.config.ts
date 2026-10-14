import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3210;

// A fresh folder per run, outside the repo, for the database, its lock and its backups.
// Workers load this file again; the variable makes them reuse the runner's folder.
process.env.CAVE_E2E_DIR ??= mkdtempSync(join(tmpdir(), "cave-e2e-"));
const dbPath = join(process.env.CAVE_E2E_DIR, "cave.db");

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  // The specs share one server and database, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // An installed browser channel, so no Playwright browser download is needed.
    channel: process.env.CAVE_E2E_CHANNEL ?? "msedge",
  },
  webServer: {
    // The owner's settings must never reach the throwaway database, whether they come from
    // .env (--no-env-file) or from the environment (blanked here; empty means the default).
    command: "bun --no-env-file run server/main.ts",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      CAVE_DB_PATH: dbPath,
      VAULT_PATH: "",
      BACKUP_DIR: "",
      CAVE_TOKEN: "",
      CAVE_HOST: "",
      CAVE_ALLOWED_HOSTS: "",
      CAVE_PUBLIC_ORIGIN: "",
    },
  },
});
