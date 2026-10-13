import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3210;

// A fresh database per run, outside the repo, so the check never touches real data.
const dbPath = join(tmpdir(), `cave-e2e-${Date.now()}.db`);

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
    command: "bun run server/main.ts",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), CAVE_DB_PATH: dbPath },
  },
});
