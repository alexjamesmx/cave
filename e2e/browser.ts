import { existsSync } from "node:fs";

/** Chromium preinstalled in Claude Code cloud sessions, where browser downloads are blocked. */
export const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";

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
  if (platform === "win32") return { channel: "msedge" };
  if (platform === "linux" && exists(CLOUD_CHROMIUM)) return { executablePath: CLOUD_CHROMIUM };
  throw new Error("No browser for e2e: set CAVE_E2E_EXECUTABLE or CAVE_E2E_CHANNEL");
}

/** The same choice as Playwright `use` options. */
export function browserUse(choice: BrowserChoice = chooseBrowser()) {
  return "channel" in choice
    ? { channel: choice.channel }
    : { launchOptions: { executablePath: choice.executablePath } };
}
