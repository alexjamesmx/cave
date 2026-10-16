import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import webpush from "web-push";
import { browserUse } from "./e2e/browser.ts";

const PORT = 3210;

// A fresh folder per run, outside the repo, for the database, its lock and its backups.
// Workers load this file again; the variable makes them reuse the runner's folder.
process.env.CAVE_E2E_DIR ??= mkdtempSync(join(tmpdir(), "cave-e2e-"));
const dbPath = join(process.env.CAVE_E2E_DIR, "cave.db");
// Throwaway VAPID keys, made once per run like the folder, so the server has Web Push on.
if (!process.env.CAVE_E2E_VAPID)
  process.env.CAVE_E2E_VAPID = JSON.stringify(webpush.generateVAPIDKeys());
const vapid = JSON.parse(process.env.CAVE_E2E_VAPID) as { publicKey: string; privateKey: string };
// The server needs a token, as in production; specs unlock with it (`e2e/helpers.ts`).
process.env.CAVE_E2E_TOKEN ??= crypto.randomUUID().replaceAll("-", "");

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  // The specs share one server and database, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...browserUse(),
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
      CAVE_TOKEN: process.env.CAVE_E2E_TOKEN,
      CAVE_HOST: "",
      CAVE_ALLOWED_HOSTS: "",
      CAVE_PUBLIC_ORIGIN: "",
      CAVE_VAPID_PUBLIC: vapid.publicKey,
      CAVE_VAPID_PRIVATE: vapid.privateKey,
      CAVE_VAPID_SUBJECT: "mailto:e2e@example.test",
      CAVE_TELEGRAM_BOT_TOKEN: "",
      CAVE_DISCORD_WEBHOOK_URL: "",
      CAVE_ENV: "test",
    },
  },
});
