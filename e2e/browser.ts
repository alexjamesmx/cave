import { existsSync } from "node:fs";

/** Chromium preinstalled in Claude Code cloud sessions, where browser downloads are blocked. */
export const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";
/** Google Chrome from its .deb (the laptop's WSL Ubuntu), where Playwright's `chrome` channel looks. */
export const LINUX_CHROME = "/opt/google/chrome/chrome";

export type BrowserChoice = { executablePath: string } | { channel: string };

/**
 * The browser e2e drives: an explicit binary, then an explicit channel, then the platform's
 * installed browser. Never a Playwright download, so it works offline and in the cloud VM.
 */
export function chooseBrowser(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): BrowserChoice {
  if (env.CAVE_E2E_EXECUTABLE) return { executablePath: env.CAVE_E2E_EXECUTABLE };
  if (env.CAVE_E2E_CHANNEL) return { channel: env.CAVE_E2E_CHANNEL };
  if (platform === "linux" && exists(CLOUD_CHROMIUM)) return { executablePath: CLOUD_CHROMIUM };
  if (platform === "linux" && exists(LINUX_CHROME)) return { channel: "chrome" };
  throw new Error("No browser for e2e: set CAVE_E2E_EXECUTABLE or CAVE_E2E_CHANNEL");
}

/**
 * Screenshot baselines per browser build: Google Chrome rasterizes text differently from the
 * cloud VM's Chromium on the same platform, so its baselines carry their own suffix.
 */
export function snapshotPathTemplate(choice: BrowserChoice = chooseBrowser()) {
  const browser = "channel" in choice && choice.channel === "chrome" ? "-chrome" : "";
  return `{testDir}/{testFileName}-snapshots/{arg}-{platform}${browser}{ext}`;
}

/** The same choice as Playwright `use` options. */
export function browserUse(choice: BrowserChoice = chooseBrowser()) {
  return "channel" in choice
    ? { channel: choice.channel }
    : { launchOptions: { executablePath: choice.executablePath } };
}
